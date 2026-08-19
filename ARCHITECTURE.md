# Fourches Caudines - Architecture & Systems Overview

## 1. System Topology

```
+-----------------------------------------------------------------------------+
|                               Web Browser                                   |
|                                                                             |
|  +------------------------+                     +------------------------+  |
|  |     Active Web Page    |                     |   Sidepanel / Sidebar  |  |
|  |  +------------------+  |                     |  +------------------+  |  |
|  |  |  Content Script  |  |                     |  |  React 18 App    |  |  |
|  |  |  - Extractor     |  |                     |  |  - Design System |  |  |
|  |  |  - Range Tracker |  |                     |  |  - Gauges/Cards  |  |  |
|  |  |  - Shadow DOM    |  |                     |  |  - Canvas Export |  |  |
|  |  +--------+---------+  |                     |  +--------+---------+  |  |
|  +-----------|------------+                     +-----------|------------+  |
|              |                                              |               |
|              +-------------------+      +-------------------+               |
|                                  |      |                                   |
|                                  v      v                                   |
|                     +-------------------------------+                       |
|                     |  Background Service Worker    |                       |
|                     |  - Tab State Manager          |                       |
|                     |  - BYOK Client Factory        |                       |
|                     |  - Analysis Pipeline Engine   |                       |
|                     |  - Cross-Context Port Bridge  |                       |
|                     +---------------+---------------+                       |
|                                     |                                       |
+-------------------------------------|---------------------------------------+
                                      v
                  +---------------------------------------+
                  |  BYOK LLM Providers (Direct API)      |
                  |  - Anthropic (Claude 3.5 Sonnet)      |
                  |  - OpenAI (GPT-4o)                    |
                  |  - Google Gemini (1.5 Pro)            |
                  |  - OpenRouter                         |
                  +---------------------------------------+
```

## 2. Core Subsystems

### 2.1 Content Script & Semantic Extractor
- **`ArticleExtractor`**: Multi-tiered content extraction leveraging JSON-LD structured data (`schema.org/NewsArticle`), semantic `<article>` tags, and text-density heuristic scoring. Computes character offsets and stable XPath coordinates per text block.
- **`RangeTracker`**: 3-tier highlight anchoring engine:
  1. *Tier 1 (DOM Range)*: Precise XPath + character offsets.
  2. *Tier 2 (Exact Quote)*: Substring search across text blocks.
  3. *Tier 3 (Fuzzy Match)*: Dice coefficient similarity and sliding window context disambiguation.
- **`ShadowHighlightOverlay`**: Closed Shadow Root preventing CSS bleeding or host page interference, supporting SVG guide lines (*traits de conduite*) and responsive repositioning via `ResizeObserver` and rAF-throttled scroll listeners.

### 2.2 Background Service Worker & Messaging Bridge
- **`UnifiedRuntime`**: Cross-browser polyfill unifying Chrome and Firefox WebExtension MV3 runtime APIs.
- **`TypedMessageBus`**: Typed RPC protocol for asynchronous query/response and event broadcasting between sidepanel, content script, and background worker.
- **`TabStateManager`**: Tab-isolated analysis state caching, progress streaming, and tab lifecycle cleanup.

### 2.3 Analysis Engine & BYOK Security
- **`FourchesCaudinesEngine`**: Evaluates 10 weighted score domains (100 total points), generates structured prompt templates with block references, and parses/repairs JSON model responses into structured findings.
- **`SecureKeyStorage`**: Client-side AES-GCM 256-bit encryption with PBKDF2 key derivation for Bring-Your-Own-Key (BYOK) provider credentials stored in extension storage.
- **`LLMClientFactory`**: Unified multi-provider interface supporting Anthropic, OpenAI, Google Gemini, and OpenRouter with streaming response capability.

### 2.4 Sidepanel User Interface & Motion Design
- **Design System**: Editorial press aesthetics with `Bricolage Grotesque` (headings), `Newsreader` (editorial serif body), and `IBM Plex Mono` (code/metadata).
- **Emil Kowalski Motion Principles**: Fast attack / gentle settle cubic bezier curves (`cubic-bezier(0.16, 1, 0.3, 1)`), spring stamp physics, count-up numbers, and full `prefers-reduced-motion` compliance.
- **`EditorialCanvasRenderer`**: High-resolution HTML5 canvas rendering for exportable, printable editorial review cards with clipboard copy and PNG download capabilities.
