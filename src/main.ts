import './styles.css';
import './styles/labels.css';
import './styles/hud.css';
import './styles/feedback.css';
import './styles/dialogs.css';
import { Game } from './game/game';

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

function showStartupError(container: HTMLElement, message: string): void {
  const panel = document.createElement('div');
  panel.className = 'startup-error';
  panel.setAttribute('role', 'alert');
  const title = document.createElement('h1');
  title.textContent = 'Moonlanders could not start';
  const body = document.createElement('p');
  body.textContent = message;
  panel.append(title, body);
  container.replaceChildren(panel);
}

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app root element');

  if (!isWebGLAvailable()) {
    showStartupError(container, 'Your browser or device does not support WebGL, which the game needs for 3D graphics.');
    return;
  }

  try {
    new Game(container);
  } catch (error) {
    console.error('[moonlanders] Failed to start.', error);
    showStartupError(container, 'Something went wrong while loading. Please refresh the page to try again.');
  }
}

bootstrap();
