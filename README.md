# Automated Document Hierarchy Extraction from PDFs  
### AI + ML Powered Document Intelligence System

This project extracts the **hierarchical structure** of unstructured PDF documents using **PDF layout analysis**, **Machine Learning**, **OCR**, and **NLP**.  
It converts documents into a clean, navigable **JSON structure** with headings, subheadings, and content blocks—similar to how enterprise compliance and document automation platforms work.

---

## 🚀 Features

### 🔍 PDF Understanding & Extraction  
- Extracts text, font size, font weight, and layout coordinates  
- Detects document structure using rules + ML  
- OCR fallback using Tesseract for scanned PDFs  
- Supports tables, lists, and multi-level headings  

### 🤖 AI + ML Processing  
- ML classifier to detect heading levels (H1, H2, H3, Paragraph, Table Title, List Item)  
- Hybrid rule-based + ML decision engine  
- NLP-based enhancement using regex patterns, capitalization ratio, numbering detection  
- Confidence scoring per detected heading  

### 🧠 Smart Hierarchy Builder  
- Automatically builds a nested hierarchy  
- Groups paragraphs under correct section  
- Unlimited heading depth (H1 → H2 → H3 → …)  
- Outputs structured JSON  

### 💻 Frontend (NO TailwindCSS)  
- Built using React / Next.js with:  
  - Drag-and-drop PDF upload  
  - Progress animations  
  - JSON Tree Viewer  
  - PDF preview with highlighted headings  
  - Statistics dashboard  
  - Dark mode toggle  
- Clean UI using CSS Modules / Bootstrap / Material UI  

### 🔗 Backend (FastAPI)  
- `/upload` – upload PDFs  
- `/process` – run OCR + ML + hierarchy builder  
- `/preview` – return PDF page images  
- `/json` – return document structure  
- `/analytics` – provide statistics  

---
