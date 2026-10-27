import { Vector3, type Camera } from 'three';

export const LabelVariant = {
  Pad: 'pad',
  Machine: 'machine',
  Deposit: 'deposit',
} as const;
export type LabelVariant = (typeof LabelVariant)[keyof typeof LabelVariant];

export interface LabelLine {
  readonly text: string;
  /** CSS color for the leading swatch; omit for plain lines. */
  readonly swatch?: string;
  readonly isDone?: boolean;
}

export interface LabelContent {
  readonly variant: LabelVariant;
  readonly title: string;
  readonly subtitle?: string;
  readonly lines: readonly LabelLine[];
  readonly accent?: string;
}

interface LabelEntry {
  readonly element: HTMLDivElement;
  signature: string;
  seenThisFrame: boolean;
}

function renderContent(element: HTMLDivElement, content: LabelContent): void {
  element.className = `world-label world-label--${content.variant}`;
  element.style.setProperty('--label-accent', content.accent ?? 'var(--color-primary)');
  const title = document.createElement('p');
  title.className = 'world-label__title';
  title.textContent = content.title;
  const children: HTMLElement[] = [title];

  if (content.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'world-label__subtitle';
    subtitle.textContent = content.subtitle;
    children.push(subtitle);
  }

  if (content.lines.length > 0) {
    const list = document.createElement('ul');
    list.className = 'world-label__lines';
    for (const line of content.lines) {
      const item = document.createElement('li');
      if (line.isDone) item.classList.add('is-done');
      if (line.swatch) {
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = line.swatch;
        item.appendChild(swatch);
      }
      item.append(line.text);
      list.appendChild(item);
    }
    children.push(list);
  }
  element.replaceChildren(...children);
}

/**
 * Screen-space labels anchored to world positions. Uses plain DOM so text
 * stays crisp, and only rebuilds an element when its content changes.
 */
export class LabelLayer {
  private readonly entries = new Map<string, LabelEntry>();
  private readonly projected = new Vector3();
  private width = 1;
  private height = 1;

  constructor(
    private readonly container: HTMLElement,
    private readonly camera: Camera,
  ) {}

  beginFrame(): void {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    for (const entry of this.entries.values()) entry.seenThisFrame = false;
  }

  show(id: string, anchor: Vector3, content: LabelContent): void {
    let entry = this.entries.get(id);
    if (!entry) {
      const element = document.createElement('div');
      this.container.appendChild(element);
      entry = { element, signature: '', seenThisFrame: false };
      this.entries.set(id, entry);
    }
    entry.seenThisFrame = true;

    const signature = JSON.stringify(content);
    if (signature !== entry.signature) {
      entry.signature = signature;
      renderContent(entry.element, content);
    }

    this.projected.copy(anchor).project(this.camera);
    const isBehindCamera = this.projected.z > 1;
    entry.element.hidden = isBehindCamera;
    if (isBehindCamera) return;
    const x = (this.projected.x * 0.5 + 0.5) * this.width;
    const y = (-this.projected.y * 0.5 + 0.5) * this.height;
    entry.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  }

  endFrame(): void {
    for (const entry of this.entries.values()) {
      if (!entry.seenThisFrame) entry.element.hidden = true;
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.element.remove();
    this.entries.clear();
  }
}
