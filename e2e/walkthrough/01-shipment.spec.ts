import { expect, test, type Page } from "@playwright/test";
import { addToManifest, checkAll, sign, tomorrowAtTen } from "../lib/shipments";
import { app, fixture, signIn, closeWindows } from "../lib/support";

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * A shipment from the main hub to Main Store's Remote Hub, on the dev database (make walkthrough).
 * It brings the goods the next walkthroughs move on (transfer, receiving, stocktake, shelving).
 *
 *   Demo Admin        opens the shipment, proposes tomorrow 10:00, builds the manifest, offers it to Demo Courier
 *   Demo Hub Keeper   agrees for the origin dock
 *   Demo Keeper       agrees for the destination dock
 *   Demo Courier      agrees to drive it: all four agreed, scheduled
 *   Demo Hub Keeper   picks the line, prepares it in a bay
 *   Demo Courier      starts the trip, checks the load, signs for it, arrives
 *   Demo Keeper       checks the goods and signs them in: in the Remote Hub
 *
 * RESUME_SHIPMENT=<id> finishes a shipment an earlier run left prepared (steps 8–9 only).
 */
const resume = Number(process.env.RESUME_SHIPMENT ?? 0);
const quantity = 10;

test(`shipment: ${quantity} of the hub's goods from the main hub to the Remote Hub`, async ({
    browser,
}) => {
    const goods = fixture.hubVariant;
    const storeKeeper = await signIn(
        browser,
        "stockkeeper",
        fixture.keeper.email,
    );
    const courier = await signIn(browser, "delivery", fixture.courier.email);
    const shipmentId = resume || (await prepare());

    async function prepare(): Promise<number> {
        const admin = await signIn(
            browser,
            "admin",
            fixture.people.admin.email,
        );

        const shipmentId =
            await test.step("1. the admin opens the shipment and proposes tomorrow 10:00", async () => {
                await admin.goto(app("admin", "/inventory/shipments"));
                await admin
                    .getByRole("button", { name: "New shipment" })
                    .click();
                const dialog = admin.getByRole("dialog");
                await dialog.getByLabel("Origin").click();
                await admin
                    .getByRole("option", { name: fixture.hub.name })
                    .click();
                await dialog.getByLabel("Destination").click();
                await admin
                    .getByRole("option", {
                        name: new RegExp(fixture.remoteHub.name),
                    })
                    .first()
                    .click();
                await dialog.getByLabel("Scheduled for").fill(tomorrowAtTen());
                await dialog.getByRole("button", { name: "Create" }).click();
                await expect(admin).toHaveURL(/\/inventory\/shipments\/\d+$/);

                return Number(new URL(admin.url()).pathname.split("/").pop());
            });

        await test.step(`2. the admin puts ${quantity} × ${goods.sku} on the manifest`, async () => {
            await addToManifest(admin, goods.sku);
            await admin.getByLabel("Qty").fill(String(quantity));
            await admin
                .getByRole("button", { name: "Add", exact: true })
                .click();
            await expect(admin.getByText("Manifest updated.")).toBeVisible();
        });

        await test.step("3. the admin offers the run to Demo Courier", async () => {
            await admin.getByLabel("Drivers offered").click();
            await admin
                .getByRole("option", { name: fixture.courier.name })
                .click();
            await admin.keyboard.press("Escape");
            await admin
                .getByRole("button", { name: "Save", exact: true })
                .click();
            await expect(
                admin.getByText(fixture.courier.name).first(),
            ).toBeVisible();
        });

        const hubKeeper = await signIn(
            browser,
            "stockkeeper",
            fixture.people.hubKeeper.email,
        );

        /** Accepts the proposed window for one seat. A keeper offered more than one seat picks it first. */
        const agree = async (
            page: Page,
            url: string,
            seat: RegExp | null,
            tick: RegExp,
        ) => {
            await page.goto(url);
            if (
                seat &&
                (await page.getByRole("button", { name: seat }).count()) > 0 &&
                (await page
                    .getByRole("button", { name: /^Accept / })
                    .count()) === 0
            ) {
                await page.getByRole("button", { name: seat }).first().click();
            }
            await page
                .getByRole("button", { name: /^Accept / })
                .first()
                .click();
            await expect(page.getByText(tick).first()).toBeVisible();
        };

        await test.step("4. the hub keeper agrees for the origin dock", () =>
            agree(
                hubKeeper,
                app("stockkeeper", `/shipments/${shipmentId}`),
                /^3\. Origin/,
                /Origin Agreed/,
            ));
        await test.step("5. the store keeper agrees for the destination dock", () =>
            agree(
                storeKeeper,
                app("stockkeeper", `/shipments/${shipmentId}`),
                /^4\. Dest\./,
                /Destination Agreed/,
            ));
        await test.step("6. the courier agrees to drive it: all four agreed", async () => {
            await agree(
                courier,
                app("delivery", `/shipments/${shipmentId}`),
                null,
                /Driver Accepted|All parties agreed|Agreed ·/,
            );
            await expect(
                courier.getByText(/All parties agreed|Agreed ·/).first(),
            ).toBeVisible();
        });

        await test.step("7. the hub keeper picks the line and prepares it in Bay 1", async () => {
            await hubKeeper.goto(
                app("stockkeeper", `/shipments/${shipmentId}`),
            );
            await hubKeeper
                .getByRole("button", { name: "Start picking" })
                .click();
            await hubKeeper
                .getByRole("button", {
                    name: new RegExp(goods.label.split(" — ")[0]),
                })
                .first()
                .click();
            await hubKeeper.getByLabel("Pickup bay").fill("Bay 1");
            await hubKeeper
                .getByRole("button", { name: "Mark prepared" })
                .click();
            await expect(
                hubKeeper.getByText("Prepared for pickup", { exact: true }),
            ).toBeVisible();
        });

        return shipmentId;
    }

    await test.step("8. the courier starts the trip, checks and signs for the load, arrives", async () => {
        await courier.goto(app("delivery", `/shipments/${shipmentId}`));
        // A resumed run may find the trip already started.
        const start = courier.getByRole("button", { name: /^Start trip to/ });
        const check = courier.getByRole("button", { name: /Check the load/ });
        await expect(start.or(check).first()).toBeVisible();
        if (await start.isVisible()) await start.click();
        await check.click();
        await checkAll(courier);
        await courier
            .getByRole("button", { name: /Sign & take the load/ })
            .click();
        await sign(courier, /^Sign$/);
        await courier.getByRole("button", { name: /^Arrived at/ }).click();
        await expect(
            courier.getByRole("button", { name: /^Arrived at/ }),
        ).toHaveCount(0);
    });

    await test.step("9. the store keeper checks the goods and signs them in", async () => {
        await storeKeeper.goto(app("stockkeeper", `/shipments/${shipmentId}`));
        await storeKeeper
            .getByRole("button", { name: /Check the goods/ })
            .click();
        await checkAll(storeKeeper);
        await storeKeeper.getByRole("button", { name: /Sign/ }).first().click();
        await sign(storeKeeper, /^Sign$/);
        await expect(storeKeeper.getByText("Finished").first()).toBeVisible();
    });

    console.log(`
  Walkthrough done: shipment #${shipmentId}, ${quantity} × ${goods.sku} (${goods.item}) from ${fixture.hub.name} to ${fixture.remoteHub.name}.
  Where to look (password in e2e/.fixture/demo.json):
    Admin       ${fixture.people.admin.email}    ${app("admin", `/inventory/shipments/${shipmentId}`)}
    Hub keeper  ${fixture.people.hubKeeper.email}    ${app("stockkeeper", `/shipments/${shipmentId}`)}
    Courier     ${fixture.courier.email}    ${app("delivery", `/shipments/${shipmentId}`)}
    Keeper      ${fixture.keeper.email}    ${app("stockkeeper", `/shipments/${shipmentId}`)}
`);
});
