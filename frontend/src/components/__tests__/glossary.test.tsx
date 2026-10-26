import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GlossaryPanel, Term } from '../Glossary';
import { GLOSSARY, TERM_IDS } from '../../lib/glossary';
import { useGlossary } from '../../store/glossaryStore';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useGlossary.getState().close();
});

describe('glossary entries', () => {
  it('give every term a short, one-line explanation', () => {
    for (const id of TERM_IDS) {
      const entry = GLOSSARY[id];
      expect(entry.term.length).toBeGreaterThan(1);
      expect(entry.short.length).toBeGreaterThan(10);
      expect(entry.short.length).toBeLessThan(140);
    }
  });
});

describe('a term in the text', () => {
  it('explains itself after the pointer rests, and closes when it leaves', () => {
    vi.useFakeTimers();
    render(<p>מסלול <Term id="prime">פריים</Term></p>);
    const trigger = screen.getByRole('button', { name: 'פריים' });

    fireEvent.pointerEnter(trigger);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain(GLOSSARY.prime.short);
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);

    fireEvent.pointerLeave(trigger);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens at once while the group is warm', () => {
    vi.useFakeTimers();
    render(
      <p>
        <Term id="prime">פריים</Term> <Term id="ltv">מימון</Term>
      </p>,
    );
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'פריים' }));
    act(() => vi.advanceTimersByTime(450));
    fireEvent.pointerLeave(screen.getByRole('button', { name: 'פריים' }));
    act(() => vi.advanceTimersByTime(160));
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'מימון' }));
    expect(screen.getByRole('tooltip').textContent).toContain(GLOSSARY.ltv.short);
  });

  it('toggles in place on a tap, since touch has no hover', () => {
    render(<Term id="npv">ערך נוכחי</Term>);
    const trigger = screen.getByRole('button', { name: 'ערך נוכחי' });
    const tap = () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      act(() => void trigger.dispatchEvent(event));
    };
    tap();
    expect(screen.getByRole('tooltip').textContent).toContain(GLOSSARY.npv.short);
    expect(useGlossary.getState().open).toBe(false);
    tap();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens the glossary at its entry on click, and the entry links there too', () => {
    render(
      <>
        <Term id="breakeven" />
        <GlossaryPanel />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: `מה זה ${GLOSSARY.breakeven.term}?` }));
    const dialog = screen.getByRole('dialog', { name: 'מילון מונחים' });
    expect(useGlossary.getState().focus).toBe('breakeven');
    expect(within(dialog).getByText(GLOSSARY.breakeven.short)).toBeTruthy();
  });
});

describe('the glossary panel', () => {
  it('lists every term, filters by search, and closes on Escape', () => {
    act(() => useGlossary.getState().show());
    render(<GlossaryPanel />);
    const dialog = screen.getByRole('dialog', { name: 'מילון מונחים' });
    expect(within(dialog).getAllByRole('term')).toHaveLength(TERM_IDS.length);

    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'חיפוש במילון' }), { target: { value: 'פריים' } });
    const terms = within(dialog).getAllByRole('term').map((node) => node.textContent);
    expect(terms).toContain('פריים');
    expect(terms.length).toBeLessThan(TERM_IDS.length);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
