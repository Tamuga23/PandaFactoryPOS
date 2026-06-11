import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-project-pos",
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("Firestore Security Rules", () => {
  it("Dirty Dozen 1: Identity Spoofing", async () => {
    const db = testEnv.authenticatedContext("alice", { email_verified: true }).firestore();
    await assertFails(db.collection("products").doc("prod1").set({
      sku: "SKU1",
      name: "Product 1",
      price: 10,
      cost: 5,
      stock: 10,
      minStockAlert: 2,
      category: "Cat",
      createdAt: 12345,
      updatedAt: 12345,
      ownerId: "bob" // Spoofed owner
    }));
  });

  it("Dirty Dozen 8: State Tampering (Sale Update)", async () => {
    const db = testEnv.authenticatedContext("alice", { email_verified: true }).firestore();
    // Simulate sale already exists by bypassing rules using admin context
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("sales").doc("sale1").set({ ownerId: "alice" });
    });
    
    // Attempt to update
    await assertFails(db.collection("sales").doc("sale1").update({
      total: 0
    }));
  });

  // Example success case
  it("Success: Create valid product", async () => {
    const db = testEnv.authenticatedContext("alice", { email_verified: true }).firestore();
    await assertSucceeds(db.collection("products").doc("prod1").set({
      sku: "SKU1",
      name: "Product 1",
      price: 10,
      cost: 5,
      stock: 10,
      minStockAlert: 2,
      category: "Cat",
      createdAt: 12345,
      updatedAt: 12345,
      ownerId: "alice"
    }));
  });
});
