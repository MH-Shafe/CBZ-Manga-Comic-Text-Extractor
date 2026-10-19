import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spacing, controlHeights, dialogWidths, radii, colors } from '../theme/tokens';

describe('Design Tokens & System Foundation', () => {
  test('defines consistent spacing scale', () => {
    assert.equal(spacing.xs, '0.25rem');
    assert.equal(spacing.sm, '0.5rem');
    assert.equal(spacing.md, '1rem');
    assert.equal(spacing.lg, '1.5rem');
    assert.equal(spacing.xl, '2rem');
    assert.equal(spacing['2xl'], '3rem');
  });

  test('defines standard control heights including WCAG AA 44px touch target', () => {
    assert.equal(controlHeights.compact, '2rem');     // 32px
    assert.equal(controlHeights.standard, '2.5rem');  // 40px
    assert.equal(controlHeights.touch, '2.75rem');    // 44px
  });

  test('defines standardized modal widths', () => {
    assert.equal(dialogWidths.small, '26.25rem');    // 420px
    assert.equal(dialogWidths.medium, '40rem');      // 640px
    assert.equal(dialogWidths.large, '56.25rem');    // 900px
    assert.equal(dialogWidths.extraLarge, '75rem');  // 1200px
  });

  test('defines consistent radii scale', () => {
    assert.equal(radii.small, '0.5rem');
    assert.equal(radii.medium, '0.75rem');
    assert.equal(radii.large, '1rem');
    assert.equal(radii.full, '9999px');
  });

  test('defines semantic color system', () => {
    assert.ok(colors.primary.DEFAULT);
    assert.ok(colors.success.DEFAULT);
    assert.ok(colors.warning.DEFAULT);
    assert.ok(colors.error.DEFAULT);
    assert.ok(colors.surface.app);
  });
});
