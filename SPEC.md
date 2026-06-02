# Amazon Image Generation Agent

## 1. Project Overview

- **Project Name**: Amazon Image Generation Agent
- **Type**: Web-based AI Agent Application (Internal Tool)
- **Core Functionality**: An intelligent agent that helps internal team generate product marketing images by analyzing product descriptions, keywords and reference images, then generating professional images using AI models.
- **Target Users**: Internal marketing team, Amazon product managers

## 2. Technology Stack

- **Frontend**: Next.js 14 + React + TailwindCSS
- **Backend**: Next.js API Routes
- **AI Text Model**: Database-managed OpenAI-compatible text provider pool - for understanding product context and generating image prompts
- **Image Generation Model**: GPT-Image 2 (OpenAI) - for generating product images
- **State Management**: React hooks + Context API
- **HTTP Client**: Axios

## 3. Feature List

### Core Features
1. **Product Input Module**
   - Text input for product name
   - Textarea for product description/keywords
   - Product category selection
   - Target audience selection
   - **Product reference image upload** (for AI to understand product style/appearance)
   - Support drag-and-drop or click to upload

2. **AI Analysis Engine**
   - Analyze product description + reference image using Claude
   - Output structured analysis including:
     - Product summary
     - Key selling points
     - Image content suggestions (what should appear in images)
     - Visual style recommendations
   - Save analysis for later reference

3. **User Guidance Input**
   - After analysis, user can input additional guidance for image generation
   - User suggestions are combined with analysis to generate optimized prompts

4. **Image Prompt Generation**
   - Combine AI analysis + user suggestions → generate image prompts
   - User selects image type: 组图/白底图/细节图/尺寸图
   - User can edit prompt before generation

5. **Image Generation**
   - Generate images using GPT-Image 2 via `/v1/images/edits`
   - Reference image is sent along with prompt
   - Support multiple image types and variations

6. **Image Preview & Edit**
   - Display generated images in grid
   - **Edit button** to modify prompt and regenerate
   - One-click download
   - Copy prompt functionality

7. **Generation History**
   - Save generated images locally
   - View history in sidebar

## 4. UI/UX Design Direction

- **Visual Style**: Modern, professional, e-commerce focused
- **Color Scheme**:
  - Primary: #FF9900 (Amazon Orange)
  - Secondary: #232F3E (Amazon Dark)
  - Accent: #146EB4 (Amazon Blue)
  - Background: #F5F5F5 (Light Gray)
  - Card: #FFFFFF
- **Layout**:
  - Single page application with sidebar
  - Left sidebar: History and settings
  - Main area: Input form and image results
- **Typography**: Inter for body, SF Pro Display for headings

## 5. Project Structure

```
amazon-image-agent/
├── src/
│   ├── app/
│   │   ├── page.tsx           # Main page
│   │   ├── layout.tsx         # Root layout
│   │   └── api/
│   │       ├── analyze/route.ts    # Claude analysis endpoint
│   │       └── generate/route.ts    # DALL-E generation endpoint
│   ├── components/
│   │   ├── ProductInput.tsx
│   │   ├── ImageGrid.tsx
│   │   ├── HistorySidebar.tsx
│   │   └── LoadingSpinner.tsx
│   ├── lib/
│   │   ├── anthropic.ts       # Claude API client
│   │   └── openai.ts          # DALL-E API client
│   └── styles/
│       └── globals.css
├── public/
├── package.json
├── tailwind.config.ts
├── next.config.js
└── .env.example
```

## 6. API Endpoints

### POST /api/analyze
**Input**: product text description + reference image
**Output**: analysis, image prompts, visual elements

Request body (multipart/form-data):
```json
{
  "productName": "string",
  "description": "string",
  "category": "string",
  "targetAudience": "string",
  "referenceImage": "file (image)"
}
```

Response:
```json
{
  "analysis": "string",
  "imagePrompts": ["string", "string", "string"],
  "visualElements": ["string"]
}
```

### POST /api/generate
**Input**: image prompt (user-edited) + reference image
**Output**: generated image

Request body (multipart/form-data):
```json
{
  "prompt": "string (user edited prompt)",
  "referenceImage": "file (image, same as analyze)",
  "style": "realistic | illustrated | white-bg | lifestyle"
}
```

Response:
```json
{
  "imageUrl": "string",
  "revisedPrompt": "string"
}
```

### PUT /api/generate (regenerate)
Same as POST /api/generate - allows user to modify prompt and regenerate

## 7. Environment Variables

```
PROVIDER_KEY_ENCRYPTION_KEY=  # encrypts provider API keys stored in DB
```
