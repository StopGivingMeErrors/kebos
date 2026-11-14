/**
 * Firestore security rules tests (Firebase emulator).
 *
 * Run: npm run test:rules
 * Requires JDK 21+ for the Firestore emulator.
 */
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { readFileSync } = require("fs");
const { resolve } = require("path");
const {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
} = require("firebase/firestore");

const PROJECT_ID = "kebos-rules-test";

let testEnv;
let passed = 0;
let failed = 0;

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "schedules", "slot1"), {
      date: "2099-01-15",
      time: "10:00",
      isBooked: true,
    });
    await setDoc(doc(db, "bookings", "booking-alice"), {
      name: "Alice",
      email: "alice@example.com",
      slotId: "slot1",
      date: "2099-01-15",
      time: "10:00",
      cancelToken: "booking-alice",
      status: "active",
    });
  });
}

async function test(name, fn) {
  try {
    await testEnv.clearFirestore();
    await seed();
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error.message || error}`);
  }
}

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  console.log("firestore.rules — schedules");
  await test("public can read schedules", async () => {
    const unauth = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(unauth, "schedules", "slot1")));
  });

  await test("public cannot flip isBooked", async () => {
    const unauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(unauth, "schedules", "slot1"), { isBooked: false })
    );
  });

  await test("public cannot create schedules", async () => {
    const unauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(unauth, "schedules", "slot-new"), {
        date: "2099-02-01",
        time: "11:00",
        isBooked: false,
      })
    );
  });

  await test("staff (claim) can update isBooked", async () => {
    const staff = testEnv
      .authenticatedContext("barber-1", { staff: true })
      .firestore();
    await assertSucceeds(
      updateDoc(doc(staff, "schedules", "slot1"), { isBooked: false })
    );
  });

  await test("authenticated NON-staff cannot write schedules", async () => {
    const user = testEnv.authenticatedContext("random-user").firestore();
    await assertFails(
      updateDoc(doc(user, "schedules", "slot1"), { isBooked: false })
    );
    await assertFails(
      setDoc(doc(user, "schedules", "slot-hack"), {
        date: "2099-03-01",
        time: "09:00",
        isBooked: false,
      })
    );
  });

  console.log("firestore.rules — bookings");
  await test("public cannot create bookings", async () => {
    const unauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(unauth, "bookings", "booking-intruder"), {
        name: "Eve",
        email: "eve@evil.com",
        slotId: "slot1",
        date: "2099-01-15",
        time: "10:00",
        cancelToken: "booking-intruder",
        status: "active",
      })
    );
  });

  await test("public cannot get booking by id", async () => {
    const unauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauth, "bookings", "booking-alice")));
  });

  await test("public cannot list bookings", async () => {
    const unauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(unauth, "bookings")));
  });

  await test("authenticated NON-staff cannot read bookings", async () => {
    const user = testEnv.authenticatedContext("random-user").firestore();
    await assertFails(getDoc(doc(user, "bookings", "booking-alice")));
    await assertFails(getDocs(collection(user, "bookings")));
  });

  await test("staff can read and list bookings", async () => {
    const staff = testEnv
      .authenticatedContext("barber-1", { staff: true })
      .firestore();
    await assertSucceeds(getDoc(doc(staff, "bookings", "booking-alice")));
    await assertSucceeds(getDocs(collection(staff, "bookings")));
  });

  await test("staff cannot write bookings from client", async () => {
    const staff = testEnv
      .authenticatedContext("barber-1", { staff: true })
      .firestore();
    await assertFails(
      updateDoc(doc(staff, "bookings", "booking-alice"), {
        status: "cancelled",
      })
    );
    await assertFails(deleteDoc(doc(staff, "bookings", "booking-alice")));
    await assertFails(
      setDoc(doc(staff, "bookings", "booking-new"), {
        name: "X",
        email: "x@y.com",
        status: "active",
      })
    );
  });

  await test("clients cannot read or write _rateLimits", async () => {
    const unauth = testEnv.unauthenticatedContext().firestore();
    const staff = testEnv
      .authenticatedContext("barber-1", { staff: true })
      .firestore();
    await assertFails(getDoc(doc(unauth, "_rateLimits", "book:ip:1")));
    await assertFails(
      setDoc(doc(staff, "_rateLimits", "book:ip:1"), { count: 1 })
    );
  });

  await testEnv.cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
