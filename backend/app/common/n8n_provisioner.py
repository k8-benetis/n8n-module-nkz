"""K8s provisioning engine for per-tenant n8n instances."""

import secrets
import logging
from kubernetes import client, config
from app.common.sanitize import n8n_resource_name, n8n_db_name, n8n_host
from app.common.fernet_crypto import encrypt_token
from app.common.tenant_config_service import upsert_tenant_config
from app.common.db import get_db_connection_safe

logger = logging.getLogger(__name__)

NAMESPACE = "nekazari"
N8N_PORT = 5678


def _load_k8s_config():
    """Load in-cluster config, fallback to kubeconfig for local dev."""
    try:
        config.load_incluster_config()
    except config.ConfigException:
        config.load_kube_config()


def _k8s_apps_v1():
    return client.AppsV1Api()


def _k8s_core_v1():
    return client.CoreV1Api()


def _k8s_networking_v1():
    return client.NetworkingV1Api()


def _k8s_autoscaling_v1():
    return client.AutoscalingV1Api()


def generate_credentials() -> dict:
    """Generate random credentials for a tenant n8n instance."""
    return {
        "username": f"admin_{secrets.token_hex(4)}",
        "password": secrets.token_urlsafe(16),
        "api_key": secrets.token_urlsafe(24),
    }


def create_n8n_tenant_db(tenant_id: str) -> bool:
    """Create a dedicated PostgreSQL database for the tenant's n8n."""
    conn = get_db_connection_safe()
    if not conn:
        return False
    try:
        conn.autocommit = True
        cur = conn.cursor()
        db_name = n8n_db_name(tenant_id)

        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        if cur.fetchone():
            logger.info(f"Database {db_name} already exists")
        else:
            cur.execute(f'CREATE DATABASE "{db_name}"')

        cur.close()
        return True
    except Exception as e:
        logger.error(f"Failed to create DB for tenant {tenant_id}: {e}")
        return False
    finally:
        conn.close()


def drop_n8n_tenant_db(tenant_id: str) -> bool:
    """Drop the tenant's n8n PostgreSQL database."""
    conn = get_db_connection_safe()
    if not conn:
        return False
    try:
        conn.autocommit = True
        cur = conn.cursor()
        db_name = n8n_db_name(tenant_id)

        cur.execute(f'DROP DATABASE IF EXISTS "{db_name}"')

        cur.close()
        return True
    except Exception as e:
        logger.error(f"Failed to drop DB for tenant {tenant_id}: {e}")
        return False
    finally:
        conn.close()


def provision_n8n_tenant(tenant_id: str) -> dict:
    """Provision all K8s resources for a tenant's n8n instance.
    Returns dict with URL, credentials, and resource names.
    """
    _load_k8s_config()
    apps_v1 = _k8s_apps_v1()
    core_v1 = _k8s_core_v1()
    net_v1 = _k8s_networking_v1()
    auto_v1 = _k8s_autoscaling_v1()

    name = n8n_resource_name(tenant_id)
    db_name = n8n_db_name(tenant_id)
    host = n8n_host(tenant_id)
    creds = generate_credentials()

    # 1. Create Secret
    secret = client.V1Secret(
        api_version="v1",
        kind="Secret",
        metadata=client.V1ObjectMeta(name=f"{name}-secret", namespace="nekazari"),
        string_data={
            "username": creds["username"],
            "password": creds["password"],
            "api-key": creds["api_key"],
        },
    )
    core_v1.create_namespaced_secret("nekazari", secret)

    # 2. Create PVC
    pvc = client.V1PersistentVolumeClaim(
        api_version="v1",
        kind="PersistentVolumeClaim",
        metadata=client.V1ObjectMeta(name=f"{name}-workflows", namespace="nekazari"),
        spec=client.V1PersistentVolumeClaimSpec(
            access_modes=["ReadWriteOnce"],
            resources=client.V1ResourceRequirements(
                requests={"storage": "10Gi"}
            ),
        ),
    )
    core_v1.create_namespaced_persistent_volume_claim("nekazari", pvc)

    # 3. Create Deployment
    deployment = client.V1Deployment(
        api_version="apps/v1",
        kind="Deployment",
        metadata=client.V1ObjectMeta(name=name, namespace="nekazari"),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(
                match_labels={"app": name}
            ),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(
                    labels={"app": name, "module": "n8n-nkz", "tenant": tenant_id}
                ),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name="n8n",
                            image="n8nio/n8n:latest",
                            ports=[client.V1ContainerPort(container_port=5678)],
                            env=[
                                client.V1EnvVar(name="N8N_HOST", value=host),
                                client.V1EnvVar(name="N8N_PROTOCOL", value="https"),
                                client.V1EnvVar(name="WEBHOOK_URL", value=f"https://{host}/"),
                                client.V1EnvVar(name="N8N_BASIC_AUTH_ACTIVE", value="true"),
                                client.V1EnvVar(
                                    name="N8N_BASIC_AUTH_USER",
                                    value_from=client.V1EnvVarSource(
                                        secret_key_ref=client.V1SecretKeySelector(
                                            name=f"{name}-secret", key="username"
                                        )
                                    ),
                                ),
                                client.V1EnvVar(
                                    name="N8N_BASIC_AUTH_PASSWORD",
                                    value_from=client.V1EnvVarSource(
                                        secret_key_ref=client.V1SecretKeySelector(
                                            name=f"{name}-secret", key="password"
                                        )
                                    ),
                                ),
                                client.V1EnvVar(name="DB_TYPE", value="postgresdb"),
                                client.V1EnvVar(name="DB_POSTGRESDB_HOST", value="postgresql-service"),
                                client.V1EnvVar(name="DB_POSTGRESDB_PORT", value="5432"),
                                client.V1EnvVar(name="DB_POSTGRESDB_DATABASE", value=db_name),
                                client.V1EnvVar(name="DB_POSTGRESDB_USER", value="postgres"),
                                client.V1EnvVar(
                                    name="DB_POSTGRESDB_PASSWORD",
                                    value_from=client.V1EnvVarSource(
                                        secret_key_ref=client.V1SecretKeySelector(
                                            name="postgresql-secret", key="password"
                                        )
                                    ),
                                ),
                                client.V1EnvVar(name="GENERIC_TIMEZONE", value="Europe/Madrid"),
                                client.V1EnvVar(name="N8N_METRICS", value="true"),
                                client.V1EnvVar(name="EXECUTIONS_DATA_PRUNE", value="true"),
                                client.V1EnvVar(name="EXECUTIONS_DATA_MAX_AGE", value="168"),
                            ],
                            resources=client.V1ResourceRequirements(
                                requests={"memory": "256Mi", "cpu": "100m"},
                                limits={"memory": "1Gi", "cpu": "500m"},
                            ),
                            volume_mounts=[
                                client.V1VolumeMount(
                                    name="workflows",
                                    mount_path="/home/node/.n8n",
                                )
                            ],
                        )
                    ],
                    volumes=[
                        client.V1Volume(
                            name="workflows",
                            persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                                claim_name=f"{name}-workflows"
                            ),
                        )
                    ],
                ),
            ),
        ),
    )
    apps_v1.create_namespaced_deployment("nekazari", deployment)

    # 4. Create Service
    service = client.V1Service(
        api_version="v1",
        kind="Service",
        metadata=client.V1ObjectMeta(name=f"{name}-service", namespace="nekazari"),
        spec=client.V1ServiceSpec(
            selector={"app": name},
            ports=[client.V1ServicePort(port=5678, target_port=5678)],
        ),
    )
    core_v1.create_namespaced_service("nekazari", service)

    # 5. Create Ingress
    ingress = client.V1Ingress(
        api_version="networking.k8s.io/v1",
        kind="Ingress",
        metadata=client.V1ObjectMeta(
            name=f"{name}-ingress",
            namespace="nekazari",
            annotations={
                "cert-manager.io/cluster-issuer": "letsencrypt-prod",
                "traefik.ingress.kubernetes.io/router.entrypoints": "websecure",
                "traefik.ingress.kubernetes.io/router.tls": "true",
            },
        ),
        spec=client.V1IngressSpec(
            tls=[
                client.V1IngressTLS(
                    hosts=[host],
                    secret_name=f"{name}-tls",
                )
            ],
            rules=[
                client.V1IngressRule(
                    host=host,
                    http=client.V1HTTPIngressRuleValue(
                        paths=[
                            client.V1HTTPIngressPath(
                                path="/",
                                path_type="Prefix",
                                backend=client.V1IngressBackend(
                                    service=client.V1IngressServiceBackend(
                                        name=f"{name}-service",
                                        port=client.V1ServiceBackendPort(number=5678),
                                    )
                                ),
                            )
                        ]
                    ),
                )
            ],
        ),
    )
    net_v1.create_namespaced_ingress("nekazari", ingress)

    # 6. Create HPA
    hpa = client.V1HorizontalPodAutoscaler(
        api_version="autoscaling/v1",
        kind="HorizontalPodAutoscaler",
        metadata=client.V1ObjectMeta(name=f"{name}-hpa", namespace="nekazari"),
        spec=client.V1HorizontalPodAutoscalerSpec(
            scale_target_ref=client.V1CrossVersionObjectReference(
                api_version="apps/v1",
                kind="Deployment",
                name=name,
            ),
            min_replicas=1,
            max_replicas=3,
            target_cpu_utilization_percentage=70,
        ),
    )
    auto_v1.create_namespaced_horizontal_pod_autoscaler("nekazari", hpa)

    # 7. Create database
    create_n8n_tenant_db(tenant_id)

    # 8. Save config
    url = f"https://{host}"
    config_data = {
        "n8n_url": url,
        "n8n_api_key_encrypted": encrypt_token(creds["api_key"]),
        "provisioning_status": "active",
        "provisioned_at": None,
        "suspended_at": None,
        "stripe_subscription_id": None,
        "n8n_admin_username": creds["username"],
        "n8n_admin_password_encrypted": encrypt_token(creds["password"]),
        "n8n_db_name": db_name,
    }
    upsert_tenant_config(tenant_id, config_data)

    return {
        "url": url,
        "username": creds["username"],
        "password": creds["password"],
        "api_key": creds["api_key"],
        "db_name": db_name,
    }
