import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/home', name: 'Arize by AmazeGen', short_name: 'Arize',
    description: 'A little space for you.', start_url: '/home', scope: '/',
    display: 'standalone', background_color: '#fffbf3', theme_color: '#2b7449',
    icons: [{ src: '/design/arize/sun.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' }],
  }
}
