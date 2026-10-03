# Audio readout edition (语音/有声版)

Contents:

- Scope and status
- Agree on scope and engine with the user
- Reading-order extraction from the DOCX
- Text normalization for Chinese readout
- Engine routes
- Applicable standards
- Audio deliverable conventions
- QA for synthesized speech
- Bounded claims

## Scope and status

An audio readout edition (朗读版/有声版) is an **optional derivative** of the frozen final document. Produce it only when the user asked for it in the contract step. It never replaces the DOCX/PDF delivery pair, and a defect in the audio never holds back an otherwise accepted document pair — record it separately.

The source for audio is always the **frozen normalized DOCX** (or the frozen single source of a PDF-only route). Never synthesize from a mid-draft manuscript: any later document edit invalidates the audio exactly as it invalidates the PDF.

## Agree on scope and engine with the user

Before synthesizing, lock these points with the user:

- reading scope: full text, or body only; whether 摘要、参考文献、附录、图表题注 are read;
- engine route (see below): online convenience versus offline/privacy versus voice cloning;
- voice, language mix, speed, and chapter splitting;
- output format, loudness target, and naming;
- licensing boundary: some engines restrict commercial use or use unofficial service endpoints — the user must accept the terms of the chosen route.

## Reading-order extraction from the DOCX

Extract text in true document order, not in `python-docx`'s flat paragraph list:

- iterate `document.element.body` and handle `w:p` and `w:tbl` in order; `document.paragraphs` alone drops table text and loses paragraph/table interleaving;
- decide explicitly, per contract, how to treat headers/footers, footnotes/endnotes, comments, text boxes, and fields — they live in separate OOXML parts and are skipped by default;
- skip TOC fields, page-number fields, and OMML equations by default; read equation captions or 题注 where present;
- use heading levels to split chapters and to announce `第 X 章` transitions;
- for tables, read the caption first, then table content only when the agreed scope says so.

## Text normalization for Chinese readout

Engine front-ends handle common cases, but documents in this skill's scope need explicit preprocessing:

- **多音字/专名:** build a document-level lexicon of polyphonic characters and proper nouns (人名、地名、机构名; e.g. 重庆、行长、朝阳) and resolve them before synthesis — via SSML `<phoneme>` where the engine supports it, or via controlled text substitution where it does not;
- **numbers and identifiers:** 发文字号 (e.g. `国发〔2024〕5 号`) must be read digit by digit and the brackets are normally silent; years, amounts, decimals, percentages, ordinals, and `第 3.2 节`-style references each follow their own reading rule — normalize them into spoken-form text before synthesis rather than trusting the engine;
- **mixed Chinese/English:** decide per document whether acronyms such as `PDF` are spelled or read as words, and keep one rule;
- **punctuation and pauses:** 《》 and quotation marks are silent; dash/ellipsis pause length varies by engine; chapter pauses are inserted by splitting synthesis per section or, where supported, by `<break>`;
- keep the preprocessed reading script beside the QA evidence so every substitution is auditable.

## Engine routes

| Route | Chinese quality | Online/offline | SSML/control | Licensing note |
|---|---|---|---|---|
| edge-tts | very good (zh-CN neural voices) | online; unofficial Edge endpoint | rate/volume/pitch only; custom SSML removed | free, no key; unofficial endpoint — user must accept the service-terms risk |
| Azure Speech TTS | very good | online | most complete SSML (`<break>`, `<say-as>`, `<phoneme>`, styles) | paid with a free tier; the compliant default for formal use |
| 火山引擎 / 阿里云 / 腾讯云 TTS | very good | online | SSML subsets; long-text synthesis | paid, commercial-safe |
| CosyVoice | very good; multilingual; cloning | offline, GPU (small builds on CPU) | instruction/mark-based | Apache-2.0 |
| GPT-SoVITS | very good; few-sample voice cloning | offline, GPU | text-level marks | code MIT; check pretrained-weight terms |
| fish-speech | top benchmark scores | offline, GPU | natural-language marks | license varies by version (research-only for current S2) — verify the exact version's LICENSE |
| Piper | limited Chinese voice set | offline, very fast CPU | minimal | successor project is GPL — check redistribution impact |
| ChatTTS | strong dialogue prosody | offline, GPU | `[uv_break]`-style marks | model weights CC BY-NC — research only, not commercial |

Default to edge-tts for zero-cost drafts and Azure (or another paid cloud API) when compliance or SSML control matters; point offline/cloning needs at CosyVoice or GPT-SoVITS. Reuse the toolchain-survey discipline from [toolchain-selection.md](toolchain-selection.md): present the routes, let the user choose, record the choice.

## Applicable standards

Verify status by exact number before citing any of these in a delivery; the register snapshot is in [source-register.md](source-register.md).

- `GB/T 21024—2007` 中文语音合成系统通用技术规范 — general technical specification for Chinese speech-synthesis systems (current at the 2026-08-20 check);
- `GB/T 34145—2017` 中文语音合成互联网服务接口规范 — interface specification for online Chinese TTS services;
- `GB/T 44144—2024` 有声读物 — the first national standard for audiobooks, effective 2024-10-01; cite it only when the deliverable is actually produced to audiobook grade;
- `GY/T 377—2023` 网络视听节目音频响度技术要求和测量方法 — loudness for online audio/video: average loudness −15 LKFS or −24 LKFS (±2 LU), true peak ≤ −1 dBTP;
- `GB/T 37668—2019` 互联网内容无障碍 — relevant when the audio edition serves an accessibility purpose;
- DAISY (NISO Z39.86) and EPUB 3 Media Overlays are the de facto international formats for accessible synchronized text+audio; use them only when the recipient asks for an accessible synchronized edition.

These are routing references, not automatic obligations. A simple MP3 readout for convenience is not a `GB/T 44144` audiobook.

## Audio deliverable conventions

- distribution: MP3 128–192 kbps CBR, 44.1 kHz; archive: WAV 16-bit 44.1/48 kHz;
- loudness: normalize to the agreed target — align with `GY/T 377—2023` (−15 LKFS for noisy-environment listening, −24 LKFS otherwise, true peak ≤ −1 dBTP); `ffmpeg -af loudnorm` in two-pass mode is the practical tool;
- chapter split: one file per top-level heading, named `001_章节名.mp3`, with ID3 title/artist/album/track metadata and a small README manifest (chapters, durations, engine, voice, date);
- inherit document-level metadata from the frozen DOCX core properties.

## QA for synthesized speech

Run every gate; a synthesized file without QA is a draft:

1. **ASR round-trip:** transcribe the synthesized audio and diff against the normalized reading script. For Chinese, FunASR (Paraformer/SenseVoice) reports roughly half the Chinese CER of Whisper; faster-whisper is the simpler multilingual fallback. Normalize both sides before diffing (full/half width, spoken-form numbers back to a canonical form, strip punctuation and whitespace) or the report drowns in false positives.
2. **Polyphone blind spot:** ASR round-trip cannot catch a polyphone read as its homophone (行长 xíng→háng transcribes identically). Cover it with the pre-synthesis lexicon, forced-alignment tooling where available, and human spot checks.
3. **Human spot check:** listen to the first and last sections, number-dense passages, proper-noun clusters, and at least one table readout.
4. **Signal checks:** verify loudness and true peak (`ffmpeg ebur128`), detect unintended silence gaps (`silencedetect`), and confirm chapter boundaries.
5. Record the engine, voice, version, lexicon, diff summary, and spot-check result in the conformance evidence.

## Bounded claims

- Say `有声版由 <engine> 合成，经 ASR 回检与人工抽检` when that is the evidence.
- Never say `符合 GB/T 44144 有声读物标准` or `出版级有声读物` without producing to that standard's actual requirements.
- Never let the audio edition imply document claims: it inherits the DOCX/PDF conformance note, it does not extend it.
