import { Injectable, Signal, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

/** Port: the on-screen keyboard. */
export abstract class OnScreenKeyboard {
  /** Height over the page in CSS pixels, null where only the visual viewport tells. */
  abstract readonly heightPx: Signal<number | null>;
}

/**
 * iOS pushes the whole page up for a field near the bottom. With the plugin the
 * page stays where it is, and the app makes room itself.
 */
@Injectable()
export class DeviceKeyboard extends OnScreenKeyboard {
  private readonly _heightPx = signal<number | null>(null);
  readonly heightPx = this._heightPx.asReadonly();

  constructor() {
    super();
    if (Capacitor.getPlatform() !== 'ios') return;
    this._heightPx.set(0);
    const failed = (error: unknown) => console.warn('Keyboard plugin failed', error);
    Keyboard.setScroll({ isDisabled: true }).catch(failed);
    Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) =>
      this._heightPx.set(keyboardHeight),
    ).catch(failed);
    Keyboard.addListener('keyboardWillHide', () => this._heightPx.set(0)).catch(failed);
  }
}
