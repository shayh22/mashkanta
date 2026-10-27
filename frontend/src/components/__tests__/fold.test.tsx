import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoreDetails } from '../MoreDetails';
import { Card } from '../ui';

const screenWidth = (phone: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('max-width'),
    addEventListener() {},
    removeEventListener() {},
  }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a card that folds on a phone', () => {
  it('shows its title and one line, and opens on a tap', async () => {
    screenWidth(true);
    const user = userEvent.setup();
    render(
      <Card title="יתרת החשבון" subtitle="פירוט מלא" fold="מתחת לאפס ב-3 מתוך 5 החודשים">
        <p>הגרף</p>
      </Card>,
    );
    const toggle = screen.getByRole('button', { name: /יתרת החשבון/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('מתחת לאפס ב-3 מתוך 5 החודשים')).toBeTruthy();
    expect(screen.queryByText('הגרף')).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('הגרף')).toBeTruthy();
    // Open, it says what the card says on a large screen.
    expect(screen.getByText('פירוט מלא')).toBeTruthy();
  });

  it('is always open on a larger screen', () => {
    screenWidth(false);
    render(
      <Card title="יתרת החשבון" fold="שורה">
        <p>הגרף</p>
      </Card>,
    );
    expect(screen.getByText('הגרף')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('never folds without a summary line', () => {
    screenWidth(true);
    render(
      <Card title="ההחלטות">
        <p>הרשימה</p>
      </Card>,
    );
    expect(screen.getByText('הרשימה')).toBeTruthy();
  });
});

describe('more details under a result', () => {
  it('is one line on a phone, counting its topics, and opens on a tap', async () => {
    screenWidth(true);
    const user = userEvent.setup();
    render(
      <MoreDetails>
        <p>עמלות</p>
        {false}
        <p>מגמות</p>
      </MoreDetails>,
    );
    const toggle = screen.getByRole('button', { name: /פרטים נוספים · 2 נושאים/ });
    expect(screen.queryByText('עמלות')).toBeNull();
    await user.click(toggle);
    expect(screen.getByText('עמלות')).toBeTruthy();
  });

  it('lists the sections on a larger screen', () => {
    screenWidth(false);
    render(
      <MoreDetails>
        <p>עמלות</p>
      </MoreDetails>,
    );
    expect(screen.getByText('עמלות')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

