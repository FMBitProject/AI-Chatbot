// Real quota SQL against ephemeral PGlite; the hook disables all network access.
// node --experimental-strip-types --import ./scripts/security-test-hook.mjs scripts/starter-chat.test.mjs
import assert from "node:assert/strict";
import { pg, db } from "./security-test-db.mjs";
import { companies } from "../src/lib/db/schema.ts";
import { consumeQuestionQuota, resolvePlanById } from "../src/lib/subscription.ts";
import { getLimits } from "../src/lib/plan-limits.ts";
import { canUseAiChat, canUseAiAnswers } from "../src/lib/pricing.ts";

try {
  for (const accountType of ["company", "individual"]) {
    const id = `starter-${accountType}`;
    await db.insert(companies).values({ id, name: id, accountType });
    const { subscription, limits } = await resolvePlanById(id);
    assert.equal(subscription.plan, "starter");
    assert.ok(canUseAiChat(subscription.plan));
    assert.equal(canUseAiAnswers(subscription.plan), false);
    assert.deepEqual(limits, getLimits("starter", true));
    // Concurrent questions compete for the same daily pool; only ten succeed.
    const daily = await Promise.all(Array.from({ length: 12 }, () => consumeQuestionQuota(id, limits)));
    assert.equal(daily.filter(result => result === null).length, 10);
    assert.deepEqual(daily.filter(Boolean), Array(2).fill({ limit: 10, period: "daily" }));
    // Simulate the end of a month with a fresh daily allowance. Rejected
    // questions must change neither counter, even when requests race.
    await pg.query("update companies set daily_question_count=0, monthly_question_count=99 where id=$1", [id]);
    const monthly = await Promise.all(Array.from({ length: 3 }, () => consumeQuestionQuota(id, limits)));
    assert.equal(monthly.filter(result => result === null).length, 1);
    assert.deepEqual(monthly.filter(Boolean), Array(2).fill({ limit: 100, period: "monthly" }));
    const { rows: [row] } = await pg.query("select daily_question_count, monthly_question_count from companies where id=$1", [id]);
    assert.equal(row.daily_question_count, 1);
    assert.equal(row.monthly_question_count, 100);
    console.log(`PASS ${accountType}: Starter chat, paid integrations denied, atomic 10/day and 100/month`);
  }
} finally {
  await pg.close();
}
