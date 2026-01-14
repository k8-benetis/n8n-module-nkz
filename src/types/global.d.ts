/**
 * Global type declarations for n8n Integration Hub module
 */

declare global {
  interface Window {
    __nekazariModuleData?: {
      [moduleName: string]: {
        [key: string]: any;
      };
    };
    __nekazariUIKit?: any;
  }
}

export {};
