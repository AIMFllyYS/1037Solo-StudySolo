'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import type { RenderMessage } from '../types'

import {
  searchClassroomImage,
  type ImageSearchState,
} from './search'

export type ImageModuleProps = {
  query: string
  alt?: string
}

export function ImageModule({
  props,
}: {
  props: ImageModuleProps
  message: RenderMessage<ImageModuleProps>
  onAnchorClick?: (segmentId: string) => void
}) {
  const [seenQuery, setSeenQuery] = useState(props.query)
  const [state, setState] = useState<ImageSearchState>({ status: 'loading' })
  if (props.query !== seenQuery) {
    setSeenQuery(props.query)
    setState({ status: 'loading' })
  }

  useEffect(() => {
    let cancelled = false
    void searchClassroomImage(props.query).then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [props.query])

  if (state.status === 'loading') {
    return (
      <p className="text-sm text-muted-foreground" data-slot="image-loading">
        正在检索图片…
      </p>
    )
  }
  if (state.status === 'empty') {
    return (
      <p className="text-sm text-muted-foreground" data-slot="image-empty">
        无结果
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <p className="text-sm text-destructive" data-slot="image-error">
        {state.message}
      </p>
    )
  }
  return (
    <Image
      src={state.url}
      alt={props.alt || state.alt}
      width={640}
      height={320}
      unoptimized
      className="max-h-48 w-full rounded-md object-cover"
      data-slot="image-ready"
    />
  )
}
