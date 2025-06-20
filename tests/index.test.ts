import { afterEach, describe, it, expect, mock } from "bun:test";
import { file } from "bun";
import { testOracleProgramExecution, testOracleProgramTally } from "@seda-protocol/dev-tools"

const WASM_PATH = "target/wasm32-wasip1/release-wasm/oracle-program.wasm";

const fetchMock = mock();

afterEach(() => {
  fetchMock.mockRestore();
});

describe("data request execution", () => {
  it("should fetch Brent Crude oil price data from Alpha Vantage", async () => {
    fetchMock.mockImplementation((url) => {
      if (url.host === "www.alphavantage.co") {
        return new Response(JSON.stringify({
          "Global Quote": {
            "05. price": "85.6400"
          }
        }));
      }

      return new Response('Unknown request');
    });

    const oracleProgram = await file(WASM_PATH).arrayBuffer();

    const vmResult = await testOracleProgramExecution(
      Buffer.from(oracleProgram),
      Buffer.from(""),
      fetchMock
    );

    expect(vmResult.exitCode).toBe(0);
    const result = Buffer.from(vmResult.result).readBigUInt64LE();
    expect(Number(result)).toBe(85640000);
  });
  });

describe("data request tally", () => {
  it("should calculate the median of the reveals", async () => {
    const oracleProgram = await file(WASM_PATH).arrayBuffer();

    function createRevealBuffer(value: number): Buffer {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64LE(BigInt(value));
      return buf;
    }

    const reveals = [
      {
        exitCode: 0,
        gasUsed: 0,
        inConsensus: true,
        result: createRevealBuffer(85640000),
      },
      {
        exitCode: 0,
        gasUsed: 0,
        inConsensus: true,
        result: createRevealBuffer(85650000),
      },
      {
      exitCode: 0,
      gasUsed: 0,
      inConsensus: true,
        result: createRevealBuffer(85630000),
      }
    ];

    const vmResult = await testOracleProgramTally(
      Buffer.from(oracleProgram),
      Buffer.from(""),
      reveals
    );

    expect(vmResult.exitCode).toBe(0);
    const result = Buffer.from(vmResult.result).readBigUInt64LE();
    expect(Number(result)).toBe(85640000);
  });
});
