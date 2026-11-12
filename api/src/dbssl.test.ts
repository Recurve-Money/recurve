import {describe, expect, it} from "vitest";
import {databaseSsl} from "./dbssl.js";

describe("databaseSsl", () => {
  it("is off for a database on this machine", () => {
    expect(databaseSsl("postgresql://postgres:pw@localhost:55432/recurve", false)).toBe(false);
    expect(databaseSsl("postgresql://postgres:pw@127.0.0.1/recurve", false)).toBe(false);
  });

  it("is off when the URL says so, as on the server's private network", () => {
    expect(databaseSsl("postgresql://recurve:pw@postgres:5432/recurve?sslmode=disable", false)).toBe(false);
  });

  it("verifies the certificate of any other host", () => {
    expect(databaseSsl("postgresql://user:pass@db.example.com:5432/railway", false)).toEqual({rejectUnauthorized: true});
  });

  it("goes by the host, not by the word localhost anywhere in the URL", () => {
    expect(databaseSsl("postgresql://user:localhost@db.example.com/localhost", false)).toEqual({rejectUnauthorized: true});
  });

  it("skips the check only when asked to", () => {
    expect(databaseSsl("postgresql://user:pass@db.example.com:5432/railway", true)).toEqual({rejectUnauthorized: false});
  });
});
