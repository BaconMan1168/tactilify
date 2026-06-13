# Tactilify

Tactilify helps make STEM diagrams more accessible for blind and low-vision students.

It allows teachers to upload visual learning materials, such as science diagrams, math graphs, and classroom worksheets, and turns them into accessible, editable outputs that can support tactile learning, Braille-friendly labeling, and clearer non-visual understanding.

**Live Demo:** https://tactilify.vercel.app/

---

## Problem

STEM education depends heavily on visual diagrams.

Students are often expected to learn from materials such as:

* Biology diagrams
* Chemistry structures
* Physics diagrams
* Math graphs
* Geometry figures
* Engineering sketches
* Labeled worksheets
* Teacher-created classroom materials

For blind and low-vision students, these resources are often difficult or impossible to use in their original form.

The challenge is not just describing a diagram. The challenge is preserving the structure, relationships, labels, and educational meaning of the diagram in a format that students can actually interact with.

Common pain points include:

* STEM diagrams are usually designed for sighted students
* Important information is often communicated through spatial layout, arrows, labels, and visual relationships
* Teachers may not have time to manually recreate diagrams in accessible formats
* Existing accessibility workflows can be slow, expensive, or highly specialized
* Students may receive simplified descriptions instead of equivalent access to the original content
* Braille and tactile learning materials are not always easy to generate from standard classroom resources

Tactilify addresses this gap by helping educators convert visual STEM materials into accessible, editable, tactile-ready learning resources.

---

## Solution

Tactilify transforms uploaded STEM diagrams into accessible learning materials.

Teachers can upload a diagram or worksheet, generate an accessible version, review and edit the result, and prepare the material for students who rely on tactile, Braille, or non-visual learning support.

The goal is to make accessibility part of the classroom workflow instead of a separate, manual process.

Tactilify can support outputs such as:

* Editable diagram canvases
* SVG-based diagram structures
* Simplified tactile-ready layouts
* Braille-friendly labels
* Accessible diagram descriptions
* Classroom-ready adapted STEM materials

---

## What Tactilify Does

Tactilify currently supports the following workflow:

1. **Upload a STEM diagram**

   Teachers can upload visual learning materials such as diagrams, worksheets, graphs, or PDF-based classroom resources.

2. **Analyze the diagram**

   Tactilify uses AI-assisted analysis and rendering tools to interpret the uploaded visual material and prepare it for accessible editing.

3. Create Accessible Outputs

   Tactilify creates a tactile SVG diagram aligned with BANA standards and an audio walkthrough

4. **Convert the diagram into an editable format**

   The uploaded content is converted into an interactive editing environment where diagram elements can be adjusted, simplified, or reorganized.

5. **Edit and refine the accessible output**

   Teachers can review the generated result, correct or adjust labels, simplify visual clutter, and make the diagram more usable for students.

6. **Export accessible learning materials**

   The final output can be downloaded an exported, ready to print on swell paper.

---

## Use Case and Impact

Tactilify is designed for educators and students who need better access to visual STEM content.

### Primary users

* STEM teachers
* Special education teachers
* Accessibility coordinators
* Schools supporting blind and low-vision students
* Students who use Braille or tactile learning materials

### Real-world use cases

Tactilify can be used to:

* Adapt biology diagrams for tactile learning
* Make math graphs easier to understand non-visually
* Convert physics diagrams into simplified accessible layouts
* Help teachers create accessible STEM resources faster
* Support students who need alternatives to purely visual instruction

### Impact

Tactilify helps reduce the manual work required to make STEM diagrams accessible.

By combining file upload, AI-assisted diagram analysis, editable diagram rendering, and Braille-friendly labeling, it helps teachers:

* Save time adapting classroom materials
* Improve access to STEM education
* Preserve more of the original diagram’s structure
* Give blind and low-vision students more complete learning resources
* Create accessible diagrams without needing highly specialized tools
* Make accessibility part of everyday teaching workflows

The larger vision is to make accessible STEM diagrams easier to create, edit, and share.

---

## Architecture

Tactilify is built as a modern web application for uploading, analyzing, editing, and exporting accessible STEM diagrams.

The system uses:

* **Next.js** for the application framework
* **React** for the user interface
* **TypeScript** for type-safe development
* **Tailwind CSS** and **shadcn/ui** for styling and reusable UI components
* **Anthropic API** for AI-assisted diagram understanding
* **Fabric.js** for interactive canvas-based editing
* **PDF.js** for handling PDF-based classroom materials
* **Sharp** and **Canvas** for image processing and rendering
* **React Dropzone** for file upload interactions
* **Zod** for validation
* **Vercel** for deployment and hosting

---

## High-Level System Design

```txt
Teacher
  |
  v
Tactilify Web App
  |
  |-- Upload diagram or PDF
  |-- Preview source material
  |-- Run AI-assisted diagram analysis
  |-- Generate editable diagram output
  |-- Review labels and structure
  |-- Adjust diagram in canvas editor
  |-- Prepare Braille-friendly labels
  |-- Export accessible material
  |
  v
Processing Layer
  |
  |-- File validation
  |-- PDF rendering
  |-- Image preparation
  |-- AI-assisted structure interpretation
  |-- Canvas/SVG generation
  |-- Accessibility formatting
  |
  v
Accessible STEM Material
  |
  |-- Editable diagram
  |-- Simplified structure
  |-- Braille-friendly labels
  |-- Tactile-ready layout
  |-- Student-friendly accessible output
```

---

## Implementation Details

### Frontend

The frontend is built with Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui.

The interface is designed around a simple teacher-facing workflow:

```txt
Upload diagram → Generate accessible version → Edit output → Prepare labels → Export
```

The goal is to keep the process approachable for educators who may not have technical accessibility training.

### File Uploads

Tactilify supports uploading visual STEM materials through a drag-and-drop interface.

Uploaded files can include diagram images or PDF-based classroom materials. File validation helps ensure that the app can process supported inputs safely and consistently.

### PDF and Image Processing

PDF.js is used to support PDF-based materials, while Sharp and Canvas help prepare uploaded visual content for processing and rendering.

This allows Tactilify to handle classroom materials that may not already exist as clean, editable diagrams.

### AI-Assisted Diagram Understanding

Tactilify uses the Anthropic API to help interpret visual STEM materials and generate accessible representations.

The AI-assisted layer helps identify the educational meaning of a diagram, including important parts, labels, relationships, and structure. This makes the output more useful than a plain image conversion because the goal is not just to reproduce the diagram visually, but to make it understandable in an accessible format.

### Interactive Diagram Editing

Fabric.js powers the interactive editing experience.

Teachers can review the generated diagram, adjust elements, refine labels, simplify clutter, and prepare the material for tactile or Braille-supported use.

This editing step is important because accessibility often requires human review. Tactilify is designed to help teachers move faster, while still giving them control over the final learning material.

### Accessibility Support

Tactilify includes accessibility-focused interface features, including live announcements and accessible UI components.

The app is designed to support users working with assistive technologies and to make the diagram adaptation process more usable for educators and accessibility specialists.

### Braille-Friendly Labeling

Tactilify helps prepare diagram labels for Braille-supported learning workflows.

Instead of keeping diagram labels only as visual text, the app helps organize labels in a way that can support tactile diagrams and Braille-based materials.

### Deployment

Tactilify is deployed on Vercel.

Vercel provides a fast deployment workflow for the Next.js application and makes the live demo publicly accessible.

---

## Tech Stack

| Area             | Technology          |
| ---------------- | ------------------- |
| Framework        | Next.js             |
| UI Library       | React               |
| Language         | TypeScript          |
| Styling          | Tailwind CSS        |
| UI Components    | shadcn/ui, Radix UI |
| AI               | Anthropic API       |
| Canvas Editing   | Fabric.js           |
| PDF Handling     | PDF.js              |
| Image Processing | Sharp, Canvas       |
| File Uploads     | React Dropzone      |
| Validation       | Zod                 |
| Hosting          | Vercel              |

---

## Why Tactilify Matters

Accessibility in STEM should not depend on whether a teacher has extra time, specialized tools, or manual formatting experience.

Tactilify makes it easier to turn visual STEM materials into accessible learning resources, helping blind and low-vision students engage with the same concepts as their peers.
