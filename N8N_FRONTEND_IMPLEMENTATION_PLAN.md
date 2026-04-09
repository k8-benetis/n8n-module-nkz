# N8N Integration Hub - Frontend Implementation Plan (Phase 2)

## Context & Diagnosis
The backend for the n8n Integration Hub (`nkz-module-n8n`) is robust, fully compliant with FIWARE NGSI-LD (Zero Direct Writes), and implements comprehensive APIs for ROS2 robotics, Odoo ERP synchronization, Intelligence AI predictions, and Sentinel NDVI analysis.

However, the **frontend is currently lagging behind the backend capabilities**. It provides a basic dashboard and execution monitoring but lacks the UI components required to consume the advanced orchestration endpoints exposed by the FastAPI service.

This plan details the necessary steps to close the gap between the frontend and backend, prioritizing UX consistency and the exposure of critical configuration panels.

---

## 1. Phase 1: UX Consistency & Navigation (High Priority)
**Goal:** Ensure users can easily navigate to the n8n core interface from any integration slot within the Unified Viewer.

- **Task 1.1:** Update `src/components/slots/IntegrationStatus.tsx`
  - Add an "Open n8n" button in the header or footer of the component.
  - Action: Open `https://n8n.robotika.cloud` (or the configured N8N_URL) in a new tab.
- **Task 1.2:** Update `src/components/slots/ExecutionMonitor.tsx`
  - Add an "Open n8n" or "View in n8n" action button next to the execution timeline.
  - Action: Open the specific execution URL or the main n8n dashboard.

## 2. Phase 2: Webhook & Notification Configuration (High Priority)
**Goal:** Expose the CRUD operations for webhooks and notification templates currently available in the backend (`/webhooks` and `/notifications`).

- **Task 2.1:** Create `WebhookConfigPanel` Component
  - **Location:** Register as an option within the Context Panel slot or as a dedicated section in `App.tsx`.
  - **Features:** 
    - List registered webhooks.
    - Form to create/edit/delete inbound/outbound webhooks.
    - "Test Webhook" button triggering the backend `/webhooks/{id}/test` endpoint.
- **Task 2.2:** Create `NotificationsPanel` Component
  - **Location:** Context Panel slot or `App.tsx` settings.
  - **Features:**
    - List available notification templates.
    - Form to send a test notification across different channels (Email, Telegram, SMS).
    - Toggle channel configurations.

## 3. Phase 3: Advanced Intelligence & Sentinel UI (Medium Priority)
**Goal:** Allow users to visualize and interact with AI predictions and NDVI alerts directly from the workflow context.

- **Task 3.1:** Expand `WorkflowStatusPanel` for Sentinel/NDVI
  - Consume `/sentinel/parcels/{id}/results` to display recent NDVI analysis results.
  - Consume `/sentinel/alerts` to show active vegetation alerts.
  - Add a UI form to consume `/sentinel/parcels/{id}/thresholds` (PUT) to allow users to adjust NDVI alert thresholds without leaving the platform.
- **Task 3.2:** Expand `WorkflowStatusPanel` for Intelligence AI
  - Consume `/intelligence/entities/{id}/predictions` to list historical predictions for the selected entity (e.g., crop yield, pest risk).
  - Display confidence scores and prediction dates.

## 4. Phase 4: ERP (Odoo) & Robotics (ROS2) Orchestration (Medium/Low Priority)
**Goal:** Surface the Odoo synchronization and ROS2 command capabilities to tenant administrators.

- **Task 4.1:** Create `OdooSyncPanel` Component
  - **Features:** 
    - Display Odoo connection status (`/odoo/status`).
    - "Trigger Sync" button (`/odoo/sync` POST).
    - Read-only data tables for recently synced parcels (`/odoo/parcels`) and harvests (`/odoo/harvests`).
- **Task 4.2:** Create `RobotsPanel` Component
  - **Features:**
    - List connected ROS2 robots (`/ros2/robots`).
    - Display live telemetry/status (battery, position).
    - UI to trigger basic commands (`/ros2/commands` POST) or create automated missions (`/ros2/missions` POST) driven by n8n workflows.

---
**Audit Mandate:** Upon completion of these frontend phases, a security and usability audit must be performed to ensure that all new API calls inject the correct Keycloak JWT tokens and that role-based access control (RBAC) is enforced in the UI (hiding configuration panels from non-admin users).