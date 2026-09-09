import { describe, it, expect } from "vitest";
import {
  isAllowedUrl,
  sanitizeUrl,
  validateEmail,
  validatePhone,
  validateTextInput,
  sanitizeText,
  sanitizeHTML,
  limitLength,
} from "../../lib/security";

describe("SSRF protection", () => {
  it("allows valid hh.ru URLs", () => {
    expect(isAllowedUrl("https://hh.ru/vacancy/12345")).toBe(true);
    expect(isAllowedUrl("https://api.hh.ru/resumes")).toBe(true);
    expect(isAllowedUrl("http://hh.ru/job/1")).toBe(true);
  });

  it("blocks non-hh.ru domains", () => {
    expect(isAllowedUrl("https://evil.com/hh.ru")).toBe(false);
    expect(isAllowedUrl("https://hh.ru.evil.com/vacancy")).toBe(false);
    expect(isAllowedUrl("https://google.com")).toBe(false);
  });

  it("blocks non-http protocols", () => {
    expect(isAllowedUrl("ftp://hh.ru/file")).toBe(false);
    expect(isAllowedUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isAllowedUrl("not-a-url")).toBe(false);
    expect(isAllowedUrl("")).toBe(false);
  });

  // P30: явные SSRF-кейсы — hh.ru-only allowlist отклоняет любые
  // loopback/private/metadata адреса независимо от их кодирования.
  it("blocks localhost and loopback names (P30 SSRF lock)", () => {
    expect(isAllowedUrl("http://localhost/x")).toBe(false);
    expect(isAllowedUrl("http://localhost:3000/admin")).toBe(false);
    expect(isAllowedUrl("http://127.0.0.1/x")).toBe(false);
    expect(isAllowedUrl("http://127.0.0.1:8080/")).toBe(false);
    expect(isAllowedUrl("https://[::1]/x")).toBe(false);
  });

  it("blocks private network ranges (P30 SSRF lock)", () => {
    expect(isAllowedUrl("http://192.168.0.1/router")).toBe(false);
    expect(isAllowedUrl("http://10.0.0.1/internal")).toBe(false);
    expect(isAllowedUrl("http://172.16.0.1/")).toBe(false);
    expect(isAllowedUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedUrl("http://192.168.1.106:3000/")).toBe(false);
  });

  it("blocks decimal/octal IP encodings and local-domain tricks (P30 SSRF lock)", () => {
    // 2130706433 == 127.0.0.1 в decimal-нотации; Node URL канонизирует
    // оба варианта в 127.0.0.1, что не проходит hh.ru-only allowlist.
    expect(isAllowedUrl("http://2130706433/x")).toBe(false);
    expect(isAllowedUrl("http://0177.0.0.1/x")).toBe(false);
    expect(isAllowedUrl("http://hh.ru.local/vacancy")).toBe(false);
    expect(isAllowedUrl("http://localhh.ru/vacancy")).toBe(false);
  });

  it("still allows legitimate hh.ru subdomains (allowlist contract unchanged)", () => {
    expect(isAllowedUrl("https://api.hh.ru/vacancies")).toBe(true);
    expect(isAllowedUrl("https://hh.ru/vacancy/1")).toBe(true);
  });

  it("private-looking URLs are also null through sanitizeUrl (defense in depth)", () => {
    expect(sanitizeUrl("http://localhost/x")).toBeNull();
    expect(sanitizeUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(sanitizeUrl("http://2130706433/x")).toBeNull();
  });
});

describe("sanitizeUrl", () => {
  it("returns the URL for allowed domains", () => {
    const result = sanitizeUrl("https://hh.ru/vacancy/123#anchor");
    expect(result).toBe("https://hh.ru/vacancy/123");
  });

  it("strips hash fragments", () => {
    const result = sanitizeUrl("https://hh.ru/page?q=test#section");
    expect(result).not.toContain("#");
  });

  it("returns null for disallowed domains", () => {
    expect(sanitizeUrl("https://evil.com")).toBeNull();
  });
});

describe("validateEmail", () => {
  it("accepts valid emails", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("test@test.org")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(validateEmail("notanemail")).toBe(false);
    expect(validateEmail("@no-local.com")).toBe(false);
    expect(validateEmail("user@")).toBe(false);
    expect(validateEmail("")).toBe(false);
  });
});

describe("validatePhone", () => {
  it("accepts valid phone numbers", () => {
    expect(validatePhone("+79001234567")).toBe(true);
    expect(validatePhone("89001234567")).toBe(true);
    expect(validatePhone("+1 (555) 123-4567")).toBe(true);
  });

  it("rejects invalid phone numbers", () => {
    expect(validatePhone("123")).toBe(false);
    expect(validatePhone("abc")).toBe(false);
    expect(validatePhone("")).toBe(false);
  });
});

describe("validateTextInput", () => {
  it("accepts valid text", () => {
    expect(validateTextInput("hello")).toBe(true);
  });

  it("rejects empty text", () => {
    expect(validateTextInput("")).toBe(false);
  });

  it("rejects text exceeding max length", () => {
    expect(validateTextInput("a".repeat(50_001))).toBe(false);
  });
});

describe("sanitizeText", () => {
  it("removes null bytes", () => {
    expect(sanitizeText("hello\x00world")).toBe("helloworld");
  });

  it("removes control characters", () => {
    expect(sanitizeText("a\x01\x02b")).toBe("ab");
  });

  it("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });
});

describe("sanitizeHTML", () => {
  it("escapes dangerous characters", () => {
    expect(sanitizeHTML('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands", () => {
    expect(sanitizeHTML("a & b")).toBe("a &amp; b");
  });
});

describe("limitLength", () => {
  it("returns unchanged text within limit", () => {
    expect(limitLength("short", 10)).toBe("short");
  });

  it("truncates text exceeding limit", () => {
    expect(limitLength("hello world", 5)).toBe("hello");
  });
});
