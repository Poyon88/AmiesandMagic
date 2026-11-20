import { describe, expect, it } from "vitest";
import { localeDuPays } from "../locale";
import { DEFAULT_COUNTRY } from "../country";
import { isLocale } from "@/i18n/config";

describe("localeDuPays", () => {
  it("donne la langue du pays quand le jeu la parle", () => {
    expect(localeDuPays("FR")).toBe("fr");
    expect(localeDuPays("LU")).toBe("fr");
    expect(localeDuPays("MX")).toBe("es");
    expect(localeDuPays("CH")).toBe("de");
    expect(localeDuPays("IT")).toBe("it");
    expect(localeDuPays("BR")).toBe("pt");
    expect(localeDuPays("JP")).toBe("ja");
    expect(localeDuPays("CN")).toBe("zh");
    expect(localeDuPays("RU")).toBe("ru");
    expect(localeDuPays("KR")).toBe("ko");
    expect(localeDuPays("TW")).toBe("zh-TW");
    expect(localeDuPays("TR")).toBe("tr");
    expect(localeDuPays("PL")).toBe("pl");
    expect(localeDuPays("EG")).toBe("ar");
    expect(localeDuPays("MA")).toBe("ar");
  });

  it("retombe sur l'anglais : pays anglophone, langue absente, pays inconnu", () => {
    for (const pays of ["US", "GB", "CA", "NL", "SE", DEFAULT_COUNTRY, "", null, undefined, "pas un pays"]) {
      expect(localeDuPays(pays)).toBe("en");
    }
  });

  it("tolère la casse et les espaces", () => {
    expect(localeDuPays(" fr ")).toBe("fr");
  });

  it("ne rend que des langues supportées", () => {
    for (const pays of ["FR", "ES", "DE", "IT", "PT", "JP", "CN", "US"]) {
      expect(isLocale(localeDuPays(pays))).toBe(true);
    }
  });
});
