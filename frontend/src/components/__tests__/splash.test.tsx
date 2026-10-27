import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Splash } from '../Splash';

const reducedMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  reducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the opening', () => {
  it('shows the mark and the name, flies to the header, and hands over', () => {
    const onDone = vi.fn();
    const target = createRef<HTMLElement>();
    render(<Splash target={target} onDone={onDone} />);
    const splash = screen.getByTestId('splash');
    expect(splash.getAttribute('aria-hidden')).toBe('true');
    expect(splash.className).toContain('pointer-events-none');
    expect(splash.textContent).toContain('משכנתא חכמה');
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(900));
    act(() => vi.advanceTimersByTime(700));
    expect(screen.queryByTestId('splash')).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });

  it('plays once a session', () => {
    render(<Splash target={createRef()} onDone={() => {}} />);
    cleanup();
    const onDone = vi.fn();
    render(<Splash target={createRef()} onDone={onDone} />);
    expect(screen.queryByTestId('splash')).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });

  it('never plays for a visitor who asked for less motion', () => {
    reducedMotion(true);
    const onDone = vi.fn();
    render(<Splash target={createRef()} onDone={onDone} />);
    expect(screen.queryByTestId('splash')).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });
});
