import { useMemo } from 'react'
import { useCameraStore } from '@/stores/camera'
import { useSceneStore } from '@/stores/scenes'
import { BASE_H, BASE_W } from '@/utils/camera'
import { Zone } from './Zone'

interface Props {
  className?: string
}

export function ZonesLayer({ className }: Props) {
  const scenes = useSceneStore((s) => s.scenes)
  const rootScenes = useMemo(
    () => scenes.filter((sc) => sc.parentId === null && sc.position),
    [scenes],
  )
  const camX = useCameraStore((s) => s.x)
  const camY = useCameraStore((s) => s.y)
  const zoom = useCameraStore((s) => s.zoom)

  const vbW = BASE_W / zoom
  const vbH = BASE_H / zoom

  return (
    <svg
      viewBox={`${camX} ${camY} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      {rootScenes.map((scene) => (
        <Zone key={scene.id} scene={scene} viewBoxW={BASE_W} viewBoxH={BASE_H} />
      ))}
    </svg>
  )
}
