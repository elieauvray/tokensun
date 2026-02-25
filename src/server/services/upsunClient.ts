const UPSUN_API = 'https://api.upsun.com';

export type UpsunVariable = {
  name: string;
  value: string;
  sensitive: boolean;
  visible_runtime: boolean;
  visible_build: boolean;
  inheritable: boolean;
  applications?: string[];
};

const ALLOWLIST = /^TOKENSUN_(DEFAULT_CONNECTION|CONNECTIONS|C[0-9A-F]{8}_(PROVIDER|BASE_URL|API_KEY|OPENAI_ORG|OPENAI_PROJECT|ANTHROPIC_VERSION))$/;

function assertAllowedVariables(vars: UpsunVariable[]): void {
  for (const v of vars) {
    if (!ALLOWLIST.test(v.name)) {
      throw new Error(`disallowed_variable_name:${v.name}`);
    }
  }
}

async function upsunFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${UPSUN_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
}

export async function writeVariables(params: {
  token: string;
  projectId: string;
  level: 'project' | 'environment';
  environmentId?: string;
  variables: UpsunVariable[];
}): Promise<void> {
  assertAllowedVariables(params.variables);

  const basePath =
    params.level === 'project'
      ? `/projects/${params.projectId}/variables`
      : `/projects/${params.projectId}/environments/${params.environmentId}/variables`;

  for (const variable of params.variables) {
    const res = await upsunFetch(params.token, basePath, {
      method: 'POST',
      body: JSON.stringify(variable)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`upsun_variable_write_failed:${variable.name}:${res.status}:${text}`);
    }
  }
}
