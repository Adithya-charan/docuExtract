
export type ComplexityLevel = 'low' | 'medium' | 'high';
export type SectionIntent = 'concept' | 'procedure' | 'warning' | 'definition' | 'summary' | 'legal' | 'general';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // stored in localstorage for demo
  phone: string;
  plan?: 'free' | 'pro' | 'enterprise';
  joinedAt?: number;
}

export interface HierarchyNode {
  id: string;
  heading: string;
  level: number;
  content: string;
  nodeSummary: string;
  complexity: ComplexityLevel;
  intent: SectionIntent;
  children: HierarchyNode[];
}

export interface AnalysisMetadata {
  confidence: number;
  pages: number;
  language: string;
  processingTime: number;
  tablesDetected: number;
  dnaSequence: string;
  fileType: 'pdf' | 'image';
}

export interface AnalysisResult {
  id: string;
  fileName: string;
  timestamp: number;
  hierarchy: HierarchyNode[];
  summary: string;
  metadata: AnalysisMetadata;
  qualityScore: number; // 0-100
  issues: string[]; // List of structural or content issues
}

export type ViewMode = 'visual' | 'mindmap' | 'json' | 'flashcards' | 'chat';
export type AppState = 'landing' | 'login' | 'signup' | 'forgot-password' | 'pricing' | 'upload' | 'processing' | 'dashboard' | 'admin';
