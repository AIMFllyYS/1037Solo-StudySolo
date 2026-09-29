/**
 * 本目录是 streamdown + react-markdown 管线的唯一入口（ADR-0011）。
 * 业务代码禁止直接 import 'streamdown' / 'react-markdown'。
 */
export { classroomMarkdownKit, type ClassroomMarkdownKit } from './kit'
export { MarkdownStream } from './stream'
