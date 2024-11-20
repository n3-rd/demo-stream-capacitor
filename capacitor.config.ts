import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blop.demostream',
  appName: 'demo-stream',
  webDir: 'build',
  server:{
    allowNavigation: ['localhost:3001'],
    url: 'http://localhost:3001',
    cleartext: true,
  }
};

export default config;
