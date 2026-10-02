'use client'

import {useEffect,useState} from 'react'
import {createObjectUrlLease} from './objectUrl'

export function useObjectUrl(blob:Blob|null,enabled=true):string|null{
  const [current,setCurrent]=useState<{blob:Blob;url:string}|null>(null)
  useEffect(()=>{
    if(!blob||!enabled)return
    const lease=createObjectUrlLease(blob)
    let active=true
    queueMicrotask(()=>{if(active)setCurrent({blob,url:lease.url})})
    return()=>{active=false;lease.release()}
  },[blob,enabled])
  return enabled&&current?.blob===blob?current.url:null
}
