// The shapes of port/extract's index.json: one per movie or external cast.

export interface StyledSpanDoc {
  text: string;
  font: string | null;
  size: number | null;
  color: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface TextDoc {
  text: string;
  alignment: string;
  wordWrap: boolean;
  fixedLineSpace: number;
  size: [number, number];
  spans: StyledSpanDoc[];
  /** The member's own style (what an empty member's text gets). */
  defaultFont?: string | null;
  defaultSize?: number | null;
  defaultColor?: string | null;
  bg?: string | null;
  /** topSpacing/bottomSpacing: space before/after (px); tabs: [position, type 1 left 2 center 3 right 4 decimal]. */
  paragraphs?: { lineSpacing: number; topSpacing: number; bottomSpacing: number; leftIndent: number; firstIndent: number; justification: number; tabs?: [number, number][] }[];
  paragraphRuns?: [number, number][];
}

export interface FieldRunDoc {
  start: number;
  height: number;
  ascent: number;
  font: string;
  fontId: number;
  style: number;
  size: number;
  color: string;
}

export interface FieldDoc {
  text: string;
  border: number;
  margin: number;
  boxShadow: number;
  boxType: number;
  alignment: number;
  bg: [number, number, number];
  scroll: number;
  rect: [number, number, number, number];
  maxHeight: number;
  textShadow: number;
  editable: boolean;
  autoTab: boolean;
  wordWrap: boolean;
  textHeight: number;
  runs: FieldRunDoc[];
  buttonType?: number;
}

export interface ShapeDoc {
  shapeType: number;
  rect: [number, number, number, number];
  pattern: number;
  fore: number;
  back: number;
  filled: number;
  lineSize: number;
  lineDirection: number;
}

export interface FontSizeDoc {
  png: string;
  cell: [number, number];
  columns: number;
  firstChar: number;
  widths: number[];
  advances: number[];
}

export interface MemberDoc {
  lib: number;
  num: number;
  name: string;
  type: string;
  png?: string;
  width?: number;
  height?: number;
  reg?: [number, number];
  depth?: number;
  useAlpha?: boolean;
  /** Indexed bitmaps: their palette member (> 0) or built-in palette (< 0), and its cast (<= 0: their own or any). */
  paletteId?: number;
  clutCastLib?: number;
  text?: TextDoc;
  field?: FieldDoc;
  shape?: ShapeDoc;
  sound?: { file: string; codec: string; rate: number; cuePoints?: number[] | null; loop?: boolean };
  font?: { name: string; pixelFont: boolean; sizes: Record<string, FontSizeDoc> };
  w3d?: string;
  palette?: string[];
  filmLoop?: { reg: [number, number]; size: [number, number] };
}

export interface SpanDoc {
  channel: number;
  start: number;
  end: number;
  scripts: [number, number][];
  params?: string[][];
}

export interface SpriteDoc {
  frame: number;
  /** Raw score channel: sprite number + 5 (the first six channels are special). */
  channel: number;
  member: [number, number];
  loc: [number, number];
  size: [number, number];
  ink: number;
  blend: number;
  blendPct: number;
  stretch: boolean;
  type: number;
  rotation: number;
  skew: number;
  fore: [number, number, number];
  back: [number, number, number];
  colorFlag: number;
  flipH: boolean;
  flipV: boolean;
  editable: boolean;
  moveable: boolean;
  trails: boolean;
}

export interface MovieDoc {
  file: string;
  stage: [number, number, number, number];
  frameRate: number;
  stageColor: [number, number, number];
  castLibs: { name: string; file: string; min: number; max: number }[];
  fonts: Record<string, string>;
  members: MemberDoc[];
  labels?: [number, string][];
  frameCount?: number;
  tempo?: { frame: number; tempo: number; cue: number }[];
  spans?: SpanDoc[];
  sprites?: SpriteDoc[];
  soundChannels?: { frame: number; channel: number; member: number }[];
}
