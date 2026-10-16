import { expect, test } from '@playwright/test';
import { signIn, type Subdomain } from './support';

/**
 * A person edits their own details on their app's /profile and sees them kept after a
 * reload. Only the phone number changes, and it is put back, because other specs pick
 * people by name (the courier at checkout).
 */
export function profileTest(subdomain: Subdomain, who: string, email: string, phone: string): void {
    test(`${who}: edits their phone number on the profile and it is kept`, async ({ browser }) => {
        const page = await signIn(browser, subdomain, email);
        await page.goto('/profile');

        const field = page.getByLabel('Phone number');
        const before = await field.inputValue();

        for (const value of [phone, before]) {
            await field.fill(value);
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect(page.getByText('Profile updated.').first()).toBeVisible();
            await page.reload();
            await expect(field).toHaveValue(value);
        }
    });
}
