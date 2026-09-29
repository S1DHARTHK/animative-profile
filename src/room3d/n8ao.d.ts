// Minimal typings for the parts of n8ao (https://github.com/N8python/n8ao) used by Look.tsx.
declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three'
  import type { Pass } from 'postprocessing'
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: {
      aoRadius: number
      distanceFalloff: number
      intensity: number
      color: Color
      halfRes: boolean
      depthAwareUpsampling: boolean
      gammaCorrection: boolean
      [key: string]: unknown
    }
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void
  }
}
