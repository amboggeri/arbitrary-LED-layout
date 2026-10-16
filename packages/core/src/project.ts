import type { z } from "zod";
import { newId } from "./ids";
import {
  PROJECT_FORMAT_VERSION,
  controllerSchema,
  fixtureSchema,
  layerSchema,
  projectSchema,
  type Controller,
  type ControllerInput,
  type Fixture,
  type FixtureInput,
  type Layer,
  type LayerInput,
  type Project,
  type ProjectInput,
} from "./model";

export class ProjectValidationError extends Error {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ProjectValidationError";
  }
}

function toValidationError(err: z.ZodError, what: string): ProjectValidationError {
  const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  const summary = issues
    .slice(0, 5)
    .map((i) => `${i.path || "(root)"}: ${i.message}`)
    .join("; ");
  return new ProjectValidationError(`Invalid ${what}: ${summary}`, issues);
}

/** Migrations keyed by the version they upgrade *from*. Add entries as the format evolves. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrate(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  let obj = raw as Record<string, unknown>;
  let v = typeof obj.version === "number" ? obj.version : PROJECT_FORMAT_VERSION;
  if (v > PROJECT_FORMAT_VERSION) {
    throw new ProjectValidationError(
      `Project format version ${v} is newer than supported (${PROJECT_FORMAT_VERSION}). Update the app.`,
      [],
    );
  }
  while (v < PROJECT_FORMAT_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new ProjectValidationError(`No migration from project version ${v}`, []);
    obj = m(obj);
    v += 1;
    obj.version = v;
  }
  return obj;
}

/** Validate + fill defaults. Throws ProjectValidationError with readable issues. */
export function parseProject(raw: unknown): Project {
  const res = projectSchema.safeParse(migrate(raw));
  if (!res.success) throw toValidationError(res.error, "project");
  return res.data;
}

export function parseProjectJson(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new ProjectValidationError(`Project file is not valid JSON: ${(e as Error).message}`, []);
  }
  return parseProject(raw);
}

export function serializeProject(p: Project, pretty = true): string {
  return JSON.stringify(p, null, pretty ? 2 : undefined);
}

export function createProject(input: ProjectInput = {}): Project {
  return parseProject(input);
}

export function createFixture(input: Omit<FixtureInput, "id"> & { id?: string }): Fixture {
  const res = fixtureSchema.safeParse({ id: newId("fx"), ...input });
  if (!res.success) throw toValidationError(res.error, "fixture");
  return res.data;
}

export function createController(input: Omit<ControllerInput, "id"> & { id?: string }): Controller {
  const res = controllerSchema.safeParse({ id: newId("ctl"), ...input });
  if (!res.success) throw toValidationError(res.error, "controller");
  return res.data;
}

export function createLayer(input: Omit<LayerInput, "id"> & { id?: string }): Layer {
  const res = layerSchema.safeParse({ id: newId("ly"), ...input });
  if (!res.success) throw toValidationError(res.error, "layer");
  return res.data;
}
