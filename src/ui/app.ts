import { AIM_KEY_SPEED, MAX_STEPS_PER_FRAME, STEP_MS } from '../config/constants';
import { newGameConfig } from '../config/game';
import { tierDef } from '../config/tiers';
import { Audio } from '../audio/audio';
import { Game, type GameEvent, type LossReason } from '../game/state';
import { resetBallSprites } from '../render/pixel';
import { Renderer, drawSpriteInto } from '../render/renderer';
import { loadBest, loadSettings, recordGame, saveSettings, type Settings } from './storage';

type Screen = 'menu' | 'settings' | 'playing' | 'paused' | 'lost';

const LOSS_TEXT: Record<LossReason, string> = {
  overflow: 'the well overflowed',
  escaped: 'a ball escaped',
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export class App {
  private settings: Settings = loadSettings();
  private audio = new Audio();
  private renderer: Renderer;
  private game: Game | null = null;
  private best = loadBest();
  private screen: Screen = 'menu';
  private settingsReturn: Screen = 'menu';
  private keys = new Set<string>();
  private pointerDownOnStage = false;
  private last = performance.now();
  private acc = 0;
  private hudCache: Record<string, string> = {};
  private nextCanvas: HTMLCanvasElement;
  private nextDrawn: number | undefined = undefined;

  constructor() {
    this.renderer = new Renderer($<HTMLCanvasElement>('#game'));
    this.nextCanvas = $<HTMLCanvasElement>('#next');
    // Ball numbers are baked into sprites; rebake once the pixel font arrives.
    document.fonts?.ready.then(() => { resetBallSprites(); this.nextDrawn = undefined; });
    this.audio.setVolumes(this.settings.sfxVolume, this.settings.musicVolume);
    this.bindInput();
    this.resize();
    new ResizeObserver(() => this.resize()).observe($('#app'));
    this.show('menu');
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- loop ----------

  private frame(t: number) {
    const dt = Math.min(250, t - this.last);
    this.last = t;
    const running = this.screen === 'playing' && this.game?.state === 'playing';
    if (this.screen !== 'paused') this.renderer.advance(dt);

    if (running && this.game) {
      const g = this.game;
      const dir = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
      if (dir) g.setAim(g.aimX + dir * AIM_KEY_SPEED * (dt / 16.67));
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP_MS && n < MAX_STEPS_PER_FRAME && g.state === 'playing') { g.step(); this.acc -= STEP_MS; n++; }
      if (n === MAX_STEPS_PER_FRAME) this.acc = 0; // slow frame: drop the backlog rather than spiral
    } else {
      this.acc = 0;
    }

    this.renderer.draw();
    this.updateHud();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private resize() {
    const app = $('#app'), stage = $('#stage'), column = $('#column');
    const cs = getComputedStyle(column);
    const inset = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
    // Width comes from the page, height from the play section; the frame then hugs the canvas.
    const availW = app.clientWidth - parseFloat(getComputedStyle(app).paddingLeft) * 2 - inset * 2;
    const availH = stage.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    this.renderer.resize(availW, availH);
    column.style.width = `${parseFloat($('#game').style.width) + inset * 2}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.nextCanvas.width = Math.round(this.nextCanvas.clientWidth * dpr);
    this.nextCanvas.height = Math.round(this.nextCanvas.clientHeight * dpr);
    this.nextDrawn = undefined;
  }

  // ---------- game lifecycle ----------

  private startGame() {
    this.game?.destroy();
    this.best = loadBest();
    const game = new Game(newGameConfig());
    this.game = game;
    game.on((e) => this.onGameEvent(e));
    this.renderer.attach(game);
    this.nextDrawn = undefined;
    this.show('playing');
  }

  private onGameEvent(e: GameEvent) {
    const a = this.audio;
    switch (e.type) {
      case 'merge': a.coin(e.tier, e.chainPos); if (tierDef(e.tier + 1).value >= 2048) a.fanfare(); break;
      case 'land': a.thud(); break;
      case 'lost': this.onLost(e.reason); break;
    }
  }

  private onLost(reason: LossReason) {
    this.audio.kazoo();
    const game = this.game!;
    const isRecord = game.score > this.best;
    const best = recordGame(game.score);
    window.setTimeout(() => {
      if (this.game === game && this.screen === 'playing') this.show('lost', { reason, best, isRecord });
    }, 700);
  }

  private pause() {
    if (this.screen === 'playing' && this.game?.state === 'playing') this.show('paused');
  }

  // ---------- input ----------

  private bindInput() {
    const stage = $('#stage');
    const aim = (e: PointerEvent) => {
      if (this.screen !== 'playing' || !this.game) return;
      this.game.setAim(this.renderer.toLogicalX(e.clientX));
    };
    stage.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.screen !== 'playing') return;
      this.pointerDownOnStage = true;
      stage.setPointerCapture(e.pointerId);
      aim(e);
    });
    stage.addEventListener('pointermove', aim);
    stage.addEventListener('pointerup', (e) => {
      if (!this.pointerDownOnStage) return;
      this.pointerDownOnStage = false;
      aim(e);
      this.game?.requestRelease();
    });
    stage.addEventListener('pointercancel', () => { this.pointerDownOnStage = false; });

    window.addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.key === 'Escape') {
        if (this.screen === 'playing') this.pause();
        else if (this.screen === 'paused') this.show('playing');
        return;
      }
      if (this.screen !== 'playing') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { this.keys.add(e.key); e.preventDefault(); }
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.game?.requestRelease(); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => { this.keys.clear(); this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });

    $('#pauseBtn').addEventListener('click', () => { this.audio.unlock(); this.pause(); });

    $('#overlay').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn) return;
      this.audio.unlock();
      this.audio.startMusic();
      this.handleAction(btn.dataset.action!);
    });
    $('#overlay').addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.name === 'sfx') this.settings.sfxVolume = Number(el.value) / 100;
      if (el.name === 'music') this.settings.musicVolume = Number(el.value) / 100;
      this.audio.setVolumes(this.settings.sfxVolume, this.settings.musicVolume);
      saveSettings(this.settings);
      if (el.name === 'sfx') this.audio.coin(0, 1);
    });
  }

  private handleAction(action: string) {
    switch (action) {
      case 'play': this.startGame(); break;
      case 'settings': this.settingsReturn = this.screen; this.show('settings'); break;
      case 'back': this.show(this.settingsReturn === 'paused' ? 'paused' : 'menu'); break;
      case 'menu': this.show('menu'); break;
      case 'resume': this.show('playing'); break;
    }
  }

  // ---------- screens ----------

  private show(screen: Screen, data: any = {}) {
    this.screen = screen;
    const overlay = $('#overlay');
    const inGame = screen === 'playing' || screen === 'paused' || screen === 'lost';
    $('#column').classList.toggle('idle', !inGame);
    document.body.dataset.screen = screen;
    this.renderer.game = inGame ? this.game : null;
    if (screen === 'playing') {
      this.last = performance.now();
      overlay.innerHTML = '';
      overlay.className = '';
      if (document.hidden) this.pause();
      return;
    }
    overlay.className = 'open';
    const { title, body } = this.screenHtml(screen, data);
    overlay.innerHTML = `<div class="card panel ${screen}"><h2 class="card-title">${title}</h2>${body}</div>`;
    overlay.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  private screenHtml(screen: Screen, data: any): { title: string; body: string } {
    switch (screen) {
      case 'menu': {
        const best = loadBest();
        return {
          title: 'block 2048',
          body: `
            <div class="buttons">
              <button data-action="play" data-autofocus>play</button>
              <button data-action="settings">settings</button>
            </div>
            ${best > 0 ? `<p class="tip">best ${best.toLocaleString()}</p>` : ''}`,
        };
      }
      case 'settings': {
        const s = this.settings;
        return {
          title: 'settings',
          body: `
            <label class="field"><span>sound</span><input type="range" name="sfx" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}"></label>
            <label class="field"><span>music</span><input type="range" name="music" min="0" max="100" value="${Math.round(s.musicVolume * 100)}"></label>
            <div class="buttons"><button data-action="back" data-autofocus>back</button></div>`,
        };
      }
      case 'paused':
        return {
          title: 'paused',
          body: `
            <div class="buttons">
              <button data-action="resume" data-autofocus>resume</button>
              <button data-action="play">restart</button>
              <button data-action="settings">settings</button>
              <button data-action="menu">quit</button>
            </div>`,
        };
      case 'lost': {
        const g = this.game!;
        return {
          title: 'game over',
          body: `
            <p class="tip">${LOSS_TEXT[data.reason as LossReason]}</p>
            <p class="final">${g.score.toLocaleString()}</p>
            <p class="tip">${data.isRecord ? 'new best' : `best ${data.best.toLocaleString()}`}<br>top ${tierDef(g.topTier).value}</p>
            <div class="buttons row">
              <button data-action="play" data-autofocus>again</button>
              <button data-action="menu">menu</button>
            </div>`,
        };
      }
      case 'playing':
        return { title: '', body: '' };
    }
  }

  // ---------- HUD ----------

  private setText(sel: string, text: string) {
    if (this.hudCache[sel] === text) return;
    this.hudCache[sel] = text;
    $(sel).textContent = text;
  }

  private updateHud() {
    const g = this.game;
    if (!g) return;
    this.setText('#score', g.score.toLocaleString());
    if (this.nextDrawn !== g.preview) {
      this.nextDrawn = g.preview;
      drawSpriteInto(this.nextCanvas, g.preview);
    }
  }
}
