import { App } from './ui/app';

const app = new App();
if (import.meta.env.DEV) (window as any).__app = app;
