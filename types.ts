
export interface Question {
  id: string;
  text: string;
  category: string;
  isCustom?: boolean;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface AIResponse {
  answer: string;
  sources: GroundingChunk[];
}

export enum AppMode {
  READ = 'READ',
  LISTEN = 'LISTEN'
}
