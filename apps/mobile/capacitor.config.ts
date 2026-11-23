import type { CapacitorConfig } from '@capacitor/cli'

// Local, unregistered development identifier. Confirm client-owned production
// identity before any future signing. Never point a release at a remote website.
const config: CapacitorConfig = {
  appId: 'com.amazegen.arize.dev',
  appName: 'Arize Foundation',
  webDir: 'dist',
  // Bridge debug output must not serialize secure plugin arguments/results.
  loggingBehavior: 'none',
  ios: { contentInset: 'automatic', preferredContentMode: 'mobile' },
}
export default config
