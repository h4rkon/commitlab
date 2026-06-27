import { useEffect, useMemo, useRef, useState } from "react";
import { buildMarkdown, downloadText } from "./exporters";
import {
  clearStoredGitConnection,
  createGitWorkspace,
  getStoredGitConnection,
  isMissingGitFile,
  loadGitWorkspace,
  normalizeConnection,
  storeGitConnection,
  testGitConnection,
  updateGitWorkspace,
  type GitConnection
} from "./gitlab";
import { calculateExpectedImpact, formatCalculatedValue, formatImpactSummary, formatSignedCalculatedValue, measureForCalculation } from "./impact";
import { qualityHints, workspaceHints } from "./quality";
import type {
  ActualMovementItem,
  CommitLabWorkspace,
  EntityType,
  EvidenceItem,
  ExpectedImpactItem,
  MeasureItem,
  StrategyGroupItem,
  StrategyItem,
  TargetItem,
  ValueItem
} from "./types";
import {
  collectionFor,
  createDemoWorkspace,
  createEmptyWorkspace,
  createEntity,
  entityInstructions,
  entityLabels,
  getEntityTitle,
  loadWorkspace,
  normalizeWorkspace,
  nowIso,
  saveWorkspace
} from "./workspace";

type Page = "connect" | "workspace" | "values" | "strategies" | "impact" | "export";

const pages: Array<{ id: Page; label: string }> = [
  { id: "connect", label: "Connect" },
  { id: "workspace", label: "Workspace" },
  { id: "values", label: "Values & Targets" },
  { id: "strategies", label: "Strategies" },
  { id: "impact", label: "Impact VDT" },
  { id: "export", label: "Export" }
];

const valueEntityTypes: EntityType[] = ["values", "measures", "targets", "actualMovements"];
const strategyEntityTypes: EntityType[] = ["strategyGroups", "strategies", "evidence"];
const confidenceOptions = ["0", "0.2", "0.4", "0.6", "0.8", "1"];
const confidenceLabels: Record<string, string> = {
  "0": "0.0 - Wild guess",
  "0.2": "0.2 - Weak hypothesis",
  "0.4": "0.4 - Plausible judgement",
  "0.6": "0.6 - Some evidence",
  "0.8": "0.8 - Strong evidence",
  "1": "1.0 - Proven here"
};
const impactModeHelp =
  "Absolute impact: fixed movement in the measure's own unit, e.g. +10 percentage points makes 10% -> 20%. Relative impact: percentage change of the current value, e.g. +50% relative makes 10% -> 15%. Gap closure impact: closes part of the Now-to-Target gap, e.g. 50% of the gap from 10% to 30% gives 20%.";

function providerLabel(provider: GitConnection["provider"]) {
  return provider === "github" ? "GitHub" : "GitLab";
}

export function App() {
  const [workspace, setWorkspace] = useState<CommitLabWorkspace>(() => loadWorkspace());
  const [page, setPage] = useState<Page>("workspace");
  const [activeType, setActiveType] = useState<EntityType>("values");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState("Saved locally");
  const [gitConnection, setGitConnection] = useState<GitConnection | undefined>(() => getStoredGitConnection());
  const [remoteLastCommitId, setRemoteLastCommitId] = useState<string | undefined>();
  const [remoteDirty, setRemoteDirty] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteMessage, setRemoteMessage] = useState("");
  const [remoteError, setRemoteError] = useState("");

  useEffect(() => {
    saveWorkspace(workspace);
  }, [workspace]);

  const updateWorkspace = (updater: (current: CommitLabWorkspace) => CommitLabWorkspace) => {
    setSaveState("Unsaved changes");
    setRemoteDirty(Boolean(gitConnection));
    setWorkspace((current) => {
      const next = updater(current);
      return { ...next, workspace: { ...next.workspace, updatedAt: nowIso() } };
    });
  };

  const persistGitConnection = (connection: GitConnection) => {
    const normalized = normalizeConnection(connection);
    setGitConnection(normalized);
    storeGitConnection(normalized);
    setWorkspace((current) => ({
      ...current,
      settings: {
        git: {
          provider: normalized.provider,
          baseUrl: normalized.baseUrl,
          projectPath: normalized.projectPath,
          branch: normalized.branch,
          filePath: normalized.filePath
        },
        gitlab: {
          baseUrl: normalized.baseUrl,
          projectPath: normalized.projectPath,
          branch: normalized.branch,
          filePath: normalized.filePath
        }
      }
    }));
  };

  const runRemoteAction = async (action: () => Promise<void>) => {
    setRemoteBusy(true);
    setRemoteError("");
    setRemoteMessage("");
    try {
      await action();
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : "Git operation failed");
    } finally {
      setRemoteBusy(false);
    }
  };

  const saveToGit = async () => {
    if (!gitConnection) {
      setRemoteError("Connect a Git repository first.");
      return;
    }
    await runRemoteAction(async () => {
      let commitId = remoteLastCommitId;
      if (!commitId) {
        try {
          const remote = await loadGitWorkspace(gitConnection);
          commitId = remote.lastCommitId;
        } catch (error) {
          if (!isMissingGitFile(error)) {
            throw error;
          }
        }
      }
      const workspaceToSave = {
        ...workspace,
        settings: {
          git: {
            provider: gitConnection.provider,
            baseUrl: gitConnection.baseUrl,
            projectPath: gitConnection.projectPath,
            branch: gitConnection.branch,
            filePath: gitConnection.filePath
          },
          gitlab: {
            baseUrl: gitConnection.baseUrl,
            projectPath: gitConnection.projectPath,
            branch: gitConnection.branch,
            filePath: gitConnection.filePath
          }
        }
      };
      const nextCommitId = commitId
        ? await updateGitWorkspace(gitConnection, workspaceToSave, commitId)
        : await createGitWorkspace(gitConnection, workspaceToSave);
      setRemoteLastCommitId(nextCommitId);
      setRemoteDirty(false);
      setSaveState(`Saved to ${providerLabel(gitConnection.provider)}`);
      setRemoteMessage(`Workspace saved to ${providerLabel(gitConnection.provider)}.`);
    });
  };

  const disconnectGit = () => {
    clearStoredGitConnection();
    setGitConnection(undefined);
    setRemoteLastCommitId(undefined);
    setRemoteDirty(false);
    setRemoteMessage("Disconnected from Git. Local draft remains available.");
    setRemoteError("");
  };

  const selectedCollection = collectionFor(activeType, workspace);
  const selectedItem = selectedCollection.find((item) => item.id === selectedId) ?? selectedCollection[0];

  useEffect(() => {
    const collection = collectionFor(activeType, workspace);
    if (!selectedId || !collection.some((item) => item.id === selectedId)) {
      setSelectedId(collection[0]?.id ?? null);
    }
  }, [activeType, selectedId, workspace]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">CommitLab V1.0.0 Draft</div>
          <h1>{workspace.workspace.name || "CommitLab Workspace"}</h1>
        </div>
        <div className="top-actions">
          {gitConnection && (
            <button disabled={remoteBusy || !remoteDirty} onClick={saveToGit}>
              {remoteBusy ? "Saving..." : remoteDirty ? `Save to ${providerLabel(gitConnection.provider)}` : `${providerLabel(gitConnection.provider)} saved`}
            </button>
          )}
          <div className="status">{gitConnection ? `${saveState}${remoteDirty ? " (not pushed)" : ""}` : "Saved locally"}</div>
        </div>
      </header>

      <nav className="nav">
        {pages.map((item) => (
          <button className={page === item.id ? "active" : ""} key={item.id} onClick={() => setPage(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <main>
        {page === "connect" && (
          <ConnectPage
            workspace={workspace}
            updateWorkspace={updateWorkspace}
            setWorkspace={setWorkspace}
            connection={gitConnection}
            persistConnection={persistGitConnection}
            disconnectGit={disconnectGit}
            remoteBusy={remoteBusy}
            remoteMessage={remoteMessage}
            remoteError={remoteError}
            setRemoteMessage={setRemoteMessage}
            runRemoteAction={runRemoteAction}
            setRemoteLastCommitId={setRemoteLastCommitId}
            setRemoteDirty={setRemoteDirty}
            setSaveState={setSaveState}
          />
        )}
        {page === "workspace" && <WorkspacePage workspace={workspace} updateWorkspace={updateWorkspace} setWorkspace={setWorkspace} setPage={setPage} />}
        {page === "values" && <ValuesAndMeasurementsPage workspace={workspace} updateWorkspace={updateWorkspace} />}
        {page === "strategies" && (
          <ValueModelPage
            title="Strategy Groups and Strategies"
            entityTypes={strategyEntityTypes}
            workspace={workspace}
            updateWorkspace={updateWorkspace}
            activeType={activeType}
            setActiveType={setActiveType}
            selectedItem={selectedItem}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        )}
        {page === "impact" && <ImpactTablePage workspace={workspace} updateWorkspace={updateWorkspace} />}
        {page === "export" && <ExportPage workspace={workspace} setWorkspace={setWorkspace} />}
      </main>
    </div>
  );
}

function ConnectPage({
  workspace,
  updateWorkspace,
  setWorkspace,
  connection,
  persistConnection,
  disconnectGit,
  remoteBusy,
  remoteMessage,
  remoteError,
  setRemoteMessage,
  runRemoteAction,
  setRemoteLastCommitId,
  setRemoteDirty,
  setSaveState
}: {
  workspace: CommitLabWorkspace;
  updateWorkspace: (updater: (current: CommitLabWorkspace) => CommitLabWorkspace) => void;
  setWorkspace: (workspace: CommitLabWorkspace) => void;
  connection: GitConnection | undefined;
  persistConnection: (connection: GitConnection) => void;
  disconnectGit: () => void;
  remoteBusy: boolean;
  remoteMessage: string;
  remoteError: string;
  setRemoteMessage: (message: string) => void;
  runRemoteAction: (action: () => Promise<void>) => Promise<void>;
  setRemoteLastCommitId: (commitId: string | undefined) => void;
  setRemoteDirty: (dirty: boolean) => void;
  setSaveState: (state: string) => void;
}) {
  const [form, setForm] = useState<GitConnection>(() => ({
    ...(workspace.settings.git ?? { provider: "gitlab", ...workspace.settings.gitlab }),
    ...connection,
    token: connection?.token ?? ""
  }));

  const currentConnection = () => normalizeConnection(form);

  const saveConnection = () => {
    const normalized = currentConnection();
    persistConnection(normalized);
    setRemoteMessage("Connection saved in this browser.");
  };

  const testConnection = () =>
    runRemoteAction(async () => {
      const normalized = currentConnection();
      await testGitConnection(normalized);
      persistConnection(normalized);
      setRemoteMessage(`${providerLabel(normalized.provider)} connection works.`);
    });

  const loadRemoteWorkspace = () =>
    runRemoteAction(async () => {
      const normalized = currentConnection();
      const remote = await loadGitWorkspace(normalized);
      persistConnection(normalized);
      setWorkspace(workspaceWithConnection(remote.workspace, normalized));
      setRemoteLastCommitId(remote.lastCommitId);
      setRemoteDirty(false);
      setSaveState(`Loaded from ${providerLabel(normalized.provider)}`);
      setRemoteMessage(`Workspace loaded from ${providerLabel(normalized.provider)}.`);
    });

  const createRemoteWorkspace = () =>
    runRemoteAction(async () => {
      const normalized = currentConnection();
      const workspaceToCreate: CommitLabWorkspace = {
        ...workspace,
        settings: {
          git: {
            provider: normalized.provider,
            baseUrl: normalized.baseUrl,
            projectPath: normalized.projectPath,
            branch: normalized.branch,
            filePath: normalized.filePath
          },
          gitlab: {
            baseUrl: normalized.baseUrl,
            projectPath: normalized.projectPath,
            branch: normalized.branch,
            filePath: normalized.filePath
          }
        }
      };
      const commitId = await createGitWorkspace(normalized, workspaceToCreate);
      persistConnection(normalized);
      setRemoteLastCommitId(commitId);
      setRemoteDirty(false);
      setSaveState(`Saved to ${providerLabel(normalized.provider)}`);
      setRemoteMessage(`Workspace created in ${providerLabel(normalized.provider)}.`);
    });

  const loadOrCreateRemoteWorkspace = () =>
    runRemoteAction(async () => {
      const normalized = currentConnection();
      try {
        const remote = await loadGitWorkspace(normalized);
        persistConnection(normalized);
        setWorkspace(workspaceWithConnection(remote.workspace, normalized));
        setRemoteLastCommitId(remote.lastCommitId);
        setRemoteDirty(false);
        setSaveState(`Loaded from ${providerLabel(normalized.provider)}`);
        setRemoteMessage(`Workspace loaded from ${providerLabel(normalized.provider)}.`);
      } catch (error) {
        if (!isMissingGitFile(error)) {
          throw error;
        }
        const workspaceToCreate: CommitLabWorkspace = {
          ...workspace,
          settings: {
            git: {
              provider: normalized.provider,
              baseUrl: normalized.baseUrl,
              projectPath: normalized.projectPath,
              branch: normalized.branch,
              filePath: normalized.filePath
            },
            gitlab: {
              baseUrl: normalized.baseUrl,
              projectPath: normalized.projectPath,
              branch: normalized.branch,
              filePath: normalized.filePath
            }
          }
        };
        const commitId = await createGitWorkspace(normalized, workspaceToCreate);
        persistConnection(normalized);
        setRemoteLastCommitId(commitId);
        setRemoteDirty(false);
        setSaveState(`Created in ${providerLabel(normalized.provider)}`);
        setRemoteMessage(`Workspace created in ${providerLabel(normalized.provider)}.`);
      }
    });

  const updateForm = (key: keyof GitConnection, value: string) => {
    setForm((current) => {
      if (key === "provider") {
        const provider = value as GitConnection["provider"];
        const previousDefault = current.provider === "github" ? "https://github.com" : "https://gitlab.com";
        return {
          ...current,
          provider,
          baseUrl: !current.baseUrl || current.baseUrl === previousDefault ? (provider === "github" ? "https://github.com" : "https://gitlab.com") : current.baseUrl
        };
      }
      return { ...current, [key]: value };
    });
    if (key !== "token") {
      updateGitSettings(updateWorkspace, key, value);
    }
  };

  const workspaceWithConnection = (source: CommitLabWorkspace, normalized: GitConnection): CommitLabWorkspace => ({
    ...source,
    settings: {
      git: {
        provider: normalized.provider,
        baseUrl: normalized.baseUrl,
        projectPath: normalized.projectPath,
        branch: normalized.branch,
        filePath: normalized.filePath
      },
      gitlab: {
        baseUrl: normalized.baseUrl,
        projectPath: normalized.projectPath,
        branch: normalized.branch,
        filePath: normalized.filePath
      }
    }
  });

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Connect</h2>
          <p>Use a GitHub or GitLab repository file as the workspace backbone. Each repository and file path represents one independent value workspace.</p>
        </div>
      </div>
      <div className="form-grid">
        <SelectInput label="Git provider" value={form.provider} options={["gitlab", "github"]} labels={{ gitlab: "GitLab", github: "GitHub" }} onChange={(value) => updateForm("provider", value)} />
        <TextInput label={`${providerLabel(form.provider)} base URL`} value={form.baseUrl} onChange={(value) => updateForm("baseUrl", value)} />
        <TextInput label={form.provider === "github" ? "Repository path" : "Project ID or path"} value={form.projectPath} placeholder={form.provider === "github" ? "owner/repo" : "group/project or numeric ID"} onChange={(value) => updateForm("projectPath", value)} />
        <TextInput label="Branch" value={form.branch} onChange={(value) => updateForm("branch", value)} />
        <TextInput label="File path" value={form.filePath} onChange={(value) => updateForm("filePath", value)} />
        <TextInput label="Access token" value={form.token} onChange={(value) => updateForm("token", value)} placeholder={form.provider === "github" ? "GitHub PAT with contents read/write" : "GitLab project or personal access token"} type="password" />
      </div>
      <div className="button-row">
        <button disabled={remoteBusy || !form.projectPath.trim() || !form.token.trim()} onClick={testConnection}>Test connection</button>
        <button disabled={remoteBusy || !form.projectPath.trim() || !form.token.trim()} onClick={loadRemoteWorkspace}>Load workspace</button>
        <button disabled={remoteBusy || !form.projectPath.trim() || !form.token.trim()} onClick={createRemoteWorkspace}>Create workspace if missing</button>
        <button disabled={remoteBusy || !form.projectPath.trim() || !form.token.trim()} onClick={loadOrCreateRemoteWorkspace}>Load or create</button>
        <button disabled={remoteBusy || !form.projectPath.trim() || !form.token.trim()} onClick={saveConnection}>Save connection locally</button>
        {connection && <button disabled={remoteBusy} onClick={disconnectGit}>Disconnect</button>}
        <button onClick={() => setWorkspace(createEmptyWorkspace())}>Create Empty Workspace</button>
        <button onClick={() => setWorkspace(createDemoWorkspace())}>Load Demo Scenario</button>
      </div>
      {remoteMessage && <p className="success-text">{remoteMessage}</p>}
      {remoteError && <p className="error-text">{remoteError}</p>}
      <p className="note">Token and connection details are stored in this browser only. Workspace data is stored in {providerLabel(form.provider)} at {form.filePath || "commitlab.json"}.</p>
    </section>
  );
}

function updateGitSettings(
  updateWorkspace: (updater: (current: CommitLabWorkspace) => CommitLabWorkspace) => void,
  key: keyof GitConnection,
  value: string
) {
  if (key === "token") return;
  updateWorkspace((current) => ({
    ...current,
    settings: {
      git: {
        ...current.settings.git,
        [key]: value
      },
      gitlab: {
        ...current.settings.gitlab,
        ...(key === "provider" ? {} : { [key]: value })
      }
    }
  }));
}

function WorkspacePage({
  workspace,
  updateWorkspace,
  setWorkspace,
  setPage
}: {
  workspace: CommitLabWorkspace;
  updateWorkspace: (updater: (current: CommitLabWorkspace) => CommitLabWorkspace) => void;
  setWorkspace: (workspace: CommitLabWorkspace) => void;
  setPage: (page: Page) => void;
}) {
  const hints = workspaceHints(workspace).slice(0, 8);
  return (
    <div className="workspace-grid">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Workspace</h2>
            <p>Set the planning context, then enrich the model one layer at a time.</p>
          </div>
          <button onClick={() => setWorkspace(createDemoWorkspace())}>Load Demo</button>
        </div>
        <div className="form-grid">
          <TextInput label="Workspace name" value={workspace.workspace.name} onChange={(value) => updateWorkspace((current) => ({ ...current, workspace: { ...current.workspace, name: value } }))} />
          <TextInput label="Cycle / planning horizon" value={workspace.workspace.cycle} onChange={(value) => updateWorkspace((current) => ({ ...current, workspace: { ...current.workspace, cycle: value } }))} />
          <TextInput label="Owner" value={workspace.workspace.owner} onChange={(value) => updateWorkspace((current) => ({ ...current, workspace: { ...current.workspace, owner: value } }))} />
          <TextArea label="Description" value={workspace.workspace.description} onChange={(value) => updateWorkspace((current) => ({ ...current, workspace: { ...current.workspace, description: value } }))} />
        </div>
      </section>
      <section className="panel">
        <h2>Stats</h2>
        <div className="stats">
          <Stat label="Values" value={workspace.values.length} />
          <Stat label="Measures" value={workspace.measures.length} />
          <Stat label="Targets" value={workspace.targets.length} />
          <Stat label="Strategy Groups" value={workspace.strategyGroups.length} />
          <Stat label="Strategies" value={workspace.strategies.length} />
          <Stat label="Expected Impacts" value={workspace.expectedImpacts.length} />
          <Stat label="Evidence" value={workspace.evidence.length} />
          <Stat label="Actual Movement" value={workspace.actualMovements.length} />
        </div>
      </section>
      <section className="panel wide">
        <h2>Step-by-Step Data Enrichment</h2>
        <div className="enrichment">
          {[
            ["1", "Capture Values", "Write rough outcomes first. They may stay incomplete."],
            ["2", "Add Measures", "Define how each value could be observed, or leave measures unlinked for now."],
            ["3", "Set Targets", "Attach targets to measures when possible, directly to values when still early."],
            ["4", "Define Strategies", "Describe possible means without pretending they are outcomes."],
            ["5", "Estimate Impact", "Use the VDT to connect each value/measure row with each distinct strategy using absolute, relative, or gap-closure assumptions."],
            ["6", "Attach Evidence", "Add notes, links, and observations that support or challenge the model."],
            ["7", "Record Movement", "Log what changed in reality, separate from task progress."]
          ].map(([step, title, text]) => (
            <div className="step" key={step}>
              <span>{step}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className="button-row">
          <button onClick={() => setPage("values")}>Define Values and Targets</button>
          <button onClick={() => setPage("strategies")}>Define Strategies</button>
          <button onClick={() => setPage("impact")}>Open Impact VDT</button>
        </div>
      </section>
      <section className="panel wide">
        <h2>Quality Hints</h2>
        {hints.length ? <ul className="hint-list">{hints.map((hint) => <li key={hint}>{hint}</li>)}</ul> : <p className="empty">No quality hints yet.</p>}
      </section>
    </div>
  );
}

function ValuesAndMeasurementsPage({
  workspace,
  updateWorkspace
}: {
  workspace: CommitLabWorkspace;
  updateWorkspace: (updater: (current: CommitLabWorkspace) => CommitLabWorkspace) => void;
}) {
  const [selectedValueId, setSelectedValueId] = useState<string | null>(workspace.values[0]?.id ?? null);
  const selectedValue = workspace.values.find((value) => value.id === selectedValueId) ?? workspace.values[0];
  const measurements = selectedValue ? workspace.measures.filter((measure) => measure.valueId === selectedValue.id) : [];

  useEffect(() => {
    if (!selectedValueId || !workspace.values.some((value) => value.id === selectedValueId)) {
      setSelectedValueId(workspace.values[0]?.id ?? null);
    }
  }, [selectedValueId, workspace.values]);

  const addValue = () => {
    const now = nowIso();
    const value: ValueItem = {
      id: `val_${Date.now().toString(36)}`,
      title: "New objective",
      ambition: "Describe the business ambition in plain language.",
      priority: "medium",
      createdAt: now,
      updatedAt: now
    };
    updateWorkspace((current) => ({ ...current, values: [...current.values, value] }));
    setSelectedValueId(value.id);
  };

  const updateValue = (patch: Partial<ValueItem>) => {
    if (!selectedValue) return;
    updateWorkspace((current) => ({
      ...current,
      values: current.values.map((value) => (value.id === selectedValue.id ? { ...value, ...patch, updatedAt: nowIso() } : value))
    }));
  };

  const addMeasurement = () => {
    if (!selectedValue) return;
    const now = nowIso();
    const measure: MeasureItem = {
      id: `mea_${Date.now().toString(36)}`,
      valueId: selectedValue.id,
      title: "New measurement",
      meter: "Describe the measurement scale.",
      now: "",
      target: "",
      wish: "",
      tolerable: "",
      createdAt: now,
      updatedAt: now
    };
    updateWorkspace((current) => ({ ...current, measures: [...current.measures, measure] }));
  };

  const updateMeasurement = (measureId: string, patch: Partial<MeasureItem>) => {
    updateWorkspace((current) => ({
      ...current,
      measures: current.measures.map((measure) => (measure.id === measureId ? { ...measure, ...patch, updatedAt: nowIso() } : measure))
    }));
  };

  const deleteMeasurement = (measureId: string) => {
    updateWorkspace((current) => ({
      ...current,
      measures: current.measures.filter((measure) => measure.id !== measureId),
      expectedImpacts: current.expectedImpacts.filter((impact) => impact.measureId !== measureId)
    }));
  };

  return (
    <div className="value-planning-grid">
      <aside className="panel sidebar">
        <div className="section-heading">
          <h2>Values / Objectives</h2>
          <button onClick={addValue}>Add</button>
        </div>
        <div className="entity-list">
          {workspace.values.map((value) => (
            <button className={selectedValue?.id === value.id ? "active entity-row" : "entity-row"} key={value.id} onClick={() => setSelectedValueId(value.id)}>
              {value.title}
            </button>
          ))}
          {!workspace.values.length && <p className="empty">Create the first objective.</p>}
        </div>
      </aside>

      <section className="panel editor-panel">
        <h2>Selected Objective</h2>
        {selectedValue ? (
          <div className="form-stack">
            <TextInput label="Value / Objective" value={selectedValue.title} onChange={(title) => updateValue({ title })} />
            <TextArea label="Ambition" value={selectedValue.ambition ?? ""} onChange={(ambition) => updateValue({ ambition })} />
            <TextArea label="Description / notes" value={selectedValue.description ?? ""} onChange={(description) => updateValue({ description })} />
            <TextInput label="Stakeholder" value={selectedValue.stakeholder ?? ""} onChange={(stakeholder) => updateValue({ stakeholder })} />
            <SelectInput label="Priority" value={selectedValue.priority ?? "medium"} options={["low", "medium", "high"]} onChange={(priority) => updateValue({ priority: priority as ValueItem["priority"] })} />
          </div>
        ) : (
          <p className="empty">Select or create an objective.</p>
        )}
      </section>

      <section className="panel wide">
        <div className="section-heading">
          <div>
            <h2>Measurements and Target Scores</h2>
            <p>Each measurement belongs to the selected objective and forms one row in the Value Decision Table.</p>
          </div>
          <button disabled={!selectedValue} onClick={addMeasurement}>Add Measurement</button>
        </div>
        {selectedValue ? (
          <div className="table-wrap">
            <table className="impact-table">
              <thead>
                <tr>
                  <th>Measurement (Scale)</th>
                  <th>Now</th>
                  <th>Target</th>
                  <th>Wish</th>
                  <th>Tolerable</th>
                  <th>Unit</th>
                  <th>Data Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {measurements.map((measure) => (
                  <tr key={measure.id}>
                    <td>
                      <TextArea label="Measurement" value={measure.title} onChange={(title) => updateMeasurement(measure.id, { title })} />
                      <TextInput label="Scale / meter" value={measure.meter ?? ""} onChange={(meter) => updateMeasurement(measure.id, { meter })} />
                    </td>
                    <td><TextInput label="Now" value={measure.now ?? ""} onChange={(now) => updateMeasurement(measure.id, { now })} /></td>
                    <td><TextInput label="Target" value={measure.target ?? ""} onChange={(target) => updateMeasurement(measure.id, { target })} /></td>
                    <td><TextInput label="Wish" value={measure.wish ?? ""} onChange={(wish) => updateMeasurement(measure.id, { wish })} /></td>
                    <td><TextInput label="Tolerable" value={measure.tolerable ?? ""} onChange={(tolerable) => updateMeasurement(measure.id, { tolerable })} /></td>
                    <td><TextInput label="Unit" value={measure.unit ?? ""} onChange={(unit) => updateMeasurement(measure.id, { unit })} /></td>
                    <td><TextInput label="Data source" value={measure.dataSource ?? ""} onChange={(dataSource) => updateMeasurement(measure.id, { dataSource })} /></td>
                    <td><button className="danger" onClick={() => deleteMeasurement(measure.id)}>Delete</button></td>
                  </tr>
                ))}
                {!measurements.length && (
                  <tr>
                    <td colSpan={8}>
                      <p className="empty">No measurements recorded for this objective yet.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Select an objective first.</p>
        )}
      </section>
    </div>
  );
}

function ValueModelPage({
  title,
  entityTypes,
  workspace,
  updateWorkspace,
  activeType,
  setActiveType,
  selectedItem,
  selectedId,
  setSelectedId
}: {
  title: string;
  entityTypes: EntityType[];
  workspace: CommitLabWorkspace;
  updateWorkspace: (updater: (current: CommitLabWorkspace) => CommitLabWorkspace) => void;
  activeType: EntityType;
  setActiveType: (type: EntityType) => void;
  selectedItem: { id: string } | undefined;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  useEffect(() => {
    if (!entityTypes.includes(activeType)) {
      setActiveType(entityTypes[0]);
      setSelectedId(null);
    }
  }, [activeType, entityTypes, setActiveType, setSelectedId]);

  const safeActiveType = entityTypes.includes(activeType) ? activeType : entityTypes[0];
  const collection = collectionFor(safeActiveType, workspace);
  const currentItem = collection.find((item) => item.id === selectedId) ?? collection[0];
  const hints = currentItem ? qualityHints(safeActiveType, currentItem, workspace) : [];

  const addEntity = () => {
    const entity = createEntity(safeActiveType, workspace);
    updateWorkspace((current) => ({ ...current, [safeActiveType]: [...collectionFor(safeActiveType, current), entity] }));
    setSelectedId(entity.id);
  };

  const deleteEntity = () => {
    if (!selectedId) return;
    updateWorkspace((current) => ({ ...current, [safeActiveType]: collectionFor(safeActiveType, current).filter((item) => item.id !== selectedId) }));
    setSelectedId(null);
  };

  const updateItem = (patch: Record<string, unknown>) => {
    if (!selectedId) return;
    updateWorkspace((current) => ({
      ...current,
      [safeActiveType]: collectionFor(safeActiveType, current).map((item) => (item.id === selectedId ? { ...item, ...patch, updatedAt: nowIso() } : item))
    }));
  };

  return (
    <div className="model-grid">
      <aside className="panel sidebar">
        <h2>{title}</h2>
        {entityTypes.map((type) => (
          <button className={safeActiveType === type ? "active list-button" : "list-button"} key={type} onClick={() => setActiveType(type)}>
            <span>{entityLabels[type]}</span>
            <small>{collectionFor(type, workspace).length}</small>
          </button>
        ))}
      </aside>
      <section className="panel list-panel">
        <div className="section-heading">
          <h2>{entityLabels[safeActiveType]}</h2>
          <button onClick={addEntity}>Add</button>
        </div>
        <div className="entity-list">
          {collection.map((item) => (
            <button className={selectedId === item.id ? "active entity-row" : "entity-row"} key={item.id} onClick={() => setSelectedId(item.id)}>
              {itemSummary(item)}
            </button>
          ))}
          {!collection.length && <p className="empty">Nothing created yet.</p>}
        </div>
      </section>
      <section className="panel editor-panel">
        <div className="section-heading">
          <h2>Editor</h2>
          {currentItem && <button className="danger" onClick={deleteEntity}>Delete</button>}
        </div>
        {currentItem ? (
          <EntityEditor type={safeActiveType} item={currentItem} workspace={workspace} updateItem={updateItem} />
        ) : (
          <p className="empty">Select or create an item.</p>
        )}
      </section>
      <aside className="panel instruction-panel">
        <h2>Guidance</h2>
        <p>{entityInstructions[safeActiveType]}</p>
        <h3>Quality Hints</h3>
        {hints.length ? <ul className="hint-list">{hints.map((hint) => <li key={hint}>{hint}</li>)}</ul> : <p className="empty">No hints for this item.</p>}
      </aside>
    </div>
  );
}

function EntityEditor({
  type,
  item,
  workspace,
  updateItem
}: {
  type: EntityType;
  item: { id: string };
  workspace: CommitLabWorkspace;
  updateItem: (patch: Record<string, unknown>) => void;
}) {
  if (type === "values") return <ValueEditor item={item as ValueItem} updateItem={updateItem} />;
  if (type === "measures") return <MeasureEditor item={item as MeasureItem} workspace={workspace} updateItem={updateItem} />;
  if (type === "targets") return <TargetEditor item={item as TargetItem} workspace={workspace} updateItem={updateItem} />;
  if (type === "strategyGroups") return <StrategyGroupEditor item={item as StrategyGroupItem} updateItem={updateItem} />;
  if (type === "strategies") return <StrategyEditor item={item as StrategyItem} workspace={workspace} updateItem={updateItem} />;
  if (type === "expectedImpacts") return <ImpactEditor item={item as ExpectedImpactItem} workspace={workspace} updateItem={updateItem} />;
  if (type === "evidence") return <EvidenceEditor item={item as EvidenceItem} workspace={workspace} updateItem={updateItem} />;
  return <MovementEditor item={item as ActualMovementItem} workspace={workspace} updateItem={updateItem} />;
}

function ValueEditor({ item, updateItem }: { item: ValueItem; updateItem: (patch: Record<string, unknown>) => void }) {
  return (
    <div className="form-stack">
      <TextInput label="Title" value={item.title} onChange={(title) => updateItem({ title })} />
      <TextArea label="Description" value={item.description ?? ""} onChange={(description) => updateItem({ description })} />
      <TextInput label="Stakeholder" value={item.stakeholder ?? ""} onChange={(stakeholder) => updateItem({ stakeholder })} />
      <SelectInput label="Priority" value={item.priority ?? "medium"} options={["low", "medium", "high"]} onChange={(priority) => updateItem({ priority })} />
      <TextInput label="Tags" value={(item.tags ?? []).join(", ")} onChange={(tags) => updateItem({ tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
    </div>
  );
}

function MeasureEditor({ item, workspace, updateItem }: { item: MeasureItem; workspace: CommitLabWorkspace; updateItem: (patch: Record<string, unknown>) => void }) {
  return (
    <div className="form-stack">
      <TextInput label="Title" value={item.title} onChange={(title) => updateItem({ title })} />
      <SelectInput label="Linked value" value={item.valueId ?? ""} options={["", ...workspace.values.map((value) => value.id)]} labels={optionLabels(workspace, "values")} onChange={(valueId) => updateItem({ valueId: valueId || undefined })} />
      <TextArea label="Description" value={item.description ?? ""} onChange={(description) => updateItem({ description })} />
      <TextInput label="Unit" value={item.unit ?? ""} onChange={(unit) => updateItem({ unit })} />
      <TextInput label="Meter" value={item.meter ?? ""} onChange={(meter) => updateItem({ meter })} />
      <TextInput label="Data source" value={item.dataSource ?? ""} onChange={(dataSource) => updateItem({ dataSource })} />
    </div>
  );
}

function TargetEditor({ item, workspace, updateItem }: { item: TargetItem; workspace: CommitLabWorkspace; updateItem: (patch: Record<string, unknown>) => void }) {
  return (
    <div className="form-stack">
      <SelectInput label="Scale point" value={item.label} options={["actual", "tolerable", "goal", "wish"]} onChange={(label) => updateItem({ label })} />
      <TextInput label="Value" value={item.value} onChange={(value) => updateItem({ value })} />
      <SelectInput label="Linked measure" value={item.measureId} options={workspace.measures.map((measure) => measure.id)} labels={optionLabels(workspace, "measures")} onChange={(measureId) => updateItem({ measureId })} />
      <TextInput label="Date" value={item.date ?? ""} onChange={(date) => updateItem({ date })} type="date" />
      <TextArea label="Rationale" value={item.rationale ?? ""} onChange={(rationale) => updateItem({ rationale })} />
    </div>
  );
}

function StrategyGroupEditor({ item, updateItem }: { item: StrategyGroupItem; updateItem: (patch: Record<string, unknown>) => void }) {
  return (
    <div className="form-stack">
      <TextInput label="Title" value={item.title} onChange={(title) => updateItem({ title })} />
      <TextArea label="Description" value={item.description ?? ""} onChange={(description) => updateItem({ description })} />
      <TextInput label="Owner" value={item.owner ?? ""} onChange={(owner) => updateItem({ owner })} />
    </div>
  );
}

function StrategyEditor({ item, workspace, updateItem }: { item: StrategyItem; workspace: CommitLabWorkspace; updateItem: (patch: Record<string, unknown>) => void }) {
  return (
    <div className="form-stack">
      <SelectInput label="Strategy group" value={item.groupId ?? ""} options={["", ...workspace.strategyGroups.map((group) => group.id)]} labels={optionLabels(workspace, "strategyGroups")} onChange={(groupId) => updateItem({ groupId: groupId || undefined })} />
      <TextInput label="Title" value={item.title} onChange={(title) => updateItem({ title })} />
      <TextArea label="Description" value={item.description ?? ""} onChange={(description) => updateItem({ description })} />
      <TextInput label="Owner" value={item.owner ?? ""} onChange={(owner) => updateItem({ owner })} />
      <SelectInput label="Effort" value={item.effort ?? "unknown"} options={["small", "medium", "large", "unknown"]} onChange={(effort) => updateItem({ effort })} />
      <SelectInput label="Status" value={item.status ?? "draft"} options={["draft", "active", "done", "paused"]} onChange={(status) => updateItem({ status })} />
    </div>
  );
}

function ImpactEditor({ item, workspace, updateItem }: { item: ExpectedImpactItem; workspace: CommitLabWorkspace; updateItem: (patch: Record<string, unknown>) => void }) {
  const measure = workspace.measures.find((candidate) => candidate.id === item.measureId);
  const calculated = measure ? calculateExpectedImpact(measureForCalculation(measure), item) : { calculationWarning: "Select a measurement row first." };
  return (
    <div className="form-stack">
      <SelectInput label="Strategy" value={item.strategyId} options={workspace.strategies.map((strategy) => strategy.id)} labels={optionLabels(workspace, "strategies")} onChange={(strategyId) => updateItem({ strategyId })} />
      <SelectInput label="Measurement row" value={item.measureId} options={workspace.measures.map((measure) => measure.id)} labels={measureOptionLabels(workspace)} onChange={(measureId) => updateItem({ measureId })} />
      <SelectInput label="Impact mode" value={item.impactMode} options={["absolute", "relative", "gapClosure"]} helpText={impactModeHelp} onChange={(impactMode) => updateItem({ impactMode })} />
      <NumberInput label="Impact value" value={item.impactValue} min={0} step={item.impactMode === "absolute" ? 1 : 5} onChange={(impactValue) => updateItem({ impactValue })} />
      <SelectInput label="Numeric direction" value={item.numericDirection ?? ""} options={["", "increase", "decrease"]} onChange={(numericDirection) => updateItem({ numericDirection: numericDirection || undefined })} />
      <SelectInput label="Confidence score" value={String(item.confidenceScore)} options={confidenceOptions} labels={confidenceLabels} onChange={(confidenceScore) => updateItem({ confidenceScore: Number(confidenceScore) })} />
      <MultiSelectInput label="Linked evidence" values={item.evidenceIds ?? []} options={workspace.evidence.map((evidence) => evidence.id)} labels={optionLabels(workspace, "evidence")} onChange={(evidenceIds) => updateItem({ evidenceIds })} />
      <TextArea label="Rationale" value={item.rationale ?? ""} onChange={(rationale) => updateItem({ rationale })} />
      <TextArea label="Assumptions" value={item.assumptions ?? ""} onChange={(assumptions) => updateItem({ assumptions })} />
      <TextArea label="Open questions" value={item.openQuestions ?? ""} onChange={(openQuestions) => updateItem({ openQuestions })} />
      <CalculationReadout calculated={calculated} unit={measure?.unit} />
    </div>
  );
}

function EvidenceEditor({ item, workspace, updateItem }: { item: EvidenceItem; workspace: CommitLabWorkspace; updateItem: (patch: Record<string, unknown>) => void }) {
  const linkedType = pluralEntityType(item.linkedEntityType);
  const linkedOptions = linkedType ? collectionFor(linkedType, workspace).map((entity) => entity.id) : [];
  return (
    <div className="form-stack">
      <TextInput label="Title" value={item.title} onChange={(title) => updateItem({ title })} />
      <TextArea label="Description" value={item.description ?? ""} onChange={(description) => updateItem({ description })} />
      <SelectInput label="Linked entity type" value={item.linkedEntityType ?? ""} options={["", "value", "measure", "target", "strategyGroup", "strategy", "expectedImpact", "actualMovement"]} onChange={(linkedEntityType) => updateItem({ linkedEntityType: linkedEntityType || undefined, linkedEntityId: undefined })} />
      <SelectInput label="Linked entity" value={item.linkedEntityId ?? ""} options={["", ...linkedOptions]} labels={linkedType ? optionLabels(workspace, linkedType) : { "": "None" }} onChange={(linkedEntityId) => updateItem({ linkedEntityId: linkedEntityId || undefined })} />
      <SelectInput label="Source type" value={item.sourceType ?? "note"} options={["note", "meeting", "metric", "crm", "document", "url", "gitlab", "customerFeedback", "expertJudgement", "benchmark", "other"]} onChange={(sourceType) => updateItem({ sourceType })} />
      <SelectInput label="Position" value={item.position ?? "neutral"} options={["supports", "challenges", "neutral"]} onChange={(position) => updateItem({ position })} />
      <SelectInput label="Evidence strength" value={String(item.evidenceStrength ?? 0)} options={confidenceOptions} labels={confidenceLabels} onChange={(evidenceStrength) => updateItem({ evidenceStrength: Number(evidenceStrength) })} />
      <TextInput label="Source" value={item.source ?? ""} onChange={(source) => updateItem({ source })} />
    </div>
  );
}

function MovementEditor({ item, workspace, updateItem }: { item: ActualMovementItem; workspace: CommitLabWorkspace; updateItem: (patch: Record<string, unknown>) => void }) {
  return (
    <div className="form-stack">
      <TextInput label="Observed value" value={item.observedValue ?? ""} onChange={(observedValue) => updateItem({ observedValue })} />
      <SelectInput label="Linked value" value={item.valueId ?? ""} options={["", ...workspace.values.map((value) => value.id)]} labels={optionLabels(workspace, "values")} onChange={(valueId) => updateItem({ valueId: valueId || undefined })} />
      <SelectInput label="Linked measure" value={item.measureId ?? ""} options={["", ...workspace.measures.map((measure) => measure.id)]} labels={optionLabels(workspace, "measures")} onChange={(measureId) => updateItem({ measureId: measureId || undefined })} />
      <SelectInput label="Linked target" value={item.targetId ?? ""} options={["", ...workspace.targets.map((target) => target.id)]} labels={optionLabels(workspace, "targets")} onChange={(targetId) => updateItem({ targetId: targetId || undefined })} />
      <TextInput label="Observation date" value={item.observationDate ?? ""} onChange={(observationDate) => updateItem({ observationDate })} type="date" />
      <SelectInput label="Evidence" value={item.evidenceId ?? ""} options={["", ...workspace.evidence.map((evidence) => evidence.id)]} labels={optionLabels(workspace, "evidence")} onChange={(evidenceId) => updateItem({ evidenceId: evidenceId || undefined })} />
      <TextArea label="Comment" value={item.comment ?? ""} onChange={(comment) => updateItem({ comment })} />
    </div>
  );
}

function ImpactTablePage({ workspace, updateWorkspace }: { workspace: CommitLabWorkspace; updateWorkspace: (updater: (current: CommitLabWorkspace) => CommitLabWorkspace) => void }) {
  const [editing, setEditing] = useState<{ measureId: string; strategyId: string } | null>(null);
  const activeImpact = editing
    ? workspace.expectedImpacts.find((item) => item.measureId === editing.measureId && item.strategyId === editing.strategyId)
    : undefined;
  const activeMeasure = editing ? workspace.measures.find((item) => item.id === editing.measureId) : undefined;
  const activeCalculated = activeImpact && activeMeasure ? calculateExpectedImpact(measureForCalculation(activeMeasure), activeImpact) : undefined;

  const updateCell = (patch: Partial<ExpectedImpactItem>) => {
    if (!editing) return;
    updateWorkspace((current) => {
      const existing = current.expectedImpacts.find((item) => item.measureId === editing.measureId && item.strategyId === editing.strategyId);
      if (existing) {
        return {
          ...current,
          expectedImpacts: current.expectedImpacts.map((item) => (item.id === existing.id ? { ...item, ...patch, updatedAt: nowIso() } : item))
        };
      }
      return {
        ...current,
        expectedImpacts: [
          ...current.expectedImpacts,
          {
            id: `imp_${editing.measureId}_${editing.strategyId}`,
            measureId: editing.measureId,
            strategyId: editing.strategyId,
            impactMode: patch.impactMode ?? "gapClosure",
            impactValue: patch.impactValue ?? 0,
            numericDirection: patch.numericDirection,
            confidenceScore: patch.confidenceScore ?? 0,
            rationale: patch.rationale,
            assumptions: patch.assumptions,
            openQuestions: patch.openQuestions,
            evidenceIds: patch.evidenceIds ?? [],
            createdAt: nowIso(),
            updatedAt: nowIso()
          }
        ]
      };
    });
  };
  const rows = measurementRows(workspace);

  const createEvidenceForCell = () => {
    if (!editing) return;
    const now = nowIso();
    const evidence: EvidenceItem = {
      id: `ev_${Date.now().toString(36)}`,
      title: "New evidence for impact assumption",
      linkedEntityType: "expectedImpact",
      sourceType: "note",
      position: "supports",
      evidenceStrength: 0.4,
      createdAt: now,
      updatedAt: now
    };
    updateWorkspace((current) => {
      const existing = current.expectedImpacts.find((item) => item.measureId === editing.measureId && item.strategyId === editing.strategyId);
      const impact =
        existing ??
        ({
          id: `imp_${editing.measureId}_${editing.strategyId}`,
          measureId: editing.measureId,
          strategyId: editing.strategyId,
          impactMode: "gapClosure",
          impactValue: 0,
          confidenceScore: 0,
          createdAt: now,
          updatedAt: now
        } satisfies ExpectedImpactItem);
      evidence.linkedEntityId = impact.id;
      return {
        ...current,
        evidence: [...current.evidence, evidence],
        expectedImpacts: existing
          ? current.expectedImpacts.map((item) => (item.id === existing.id ? { ...item, evidenceIds: [...new Set([...(item.evidenceIds ?? []), evidence.id])], updatedAt: now } : item))
          : [...current.expectedImpacts, { ...impact, evidenceIds: [evidence.id] }]
      };
    });
  };

  return (
    <div className="impact-layout">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Value Decision Table</h2>
            <p>Rows are Value/Objectives with ambition and measurements. Columns are strategy groups and distinct strategies. Cells model raw and confidence-adjusted expected movement.</p>
          </div>
        </div>
        {rows.length && workspace.strategies.length ? (
          <div className="table-wrap">
            <table className="impact-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Value / Objective</th>
                  <th rowSpan={2}>Ambition</th>
                  <th rowSpan={2}>Measurement (Scale)</th>
                  <th rowSpan={2}>Now</th>
                  <th rowSpan={2}>Target</th>
                  <th rowSpan={2}>Wish</th>
                  <th rowSpan={2}>Tolerable</th>
                  {workspace.strategies.map((strategy) => (
                    <th key={strategy.id}>{getEntityTitle(workspace, "strategyGroups", strategy.groupId) || "Ungrouped"}</th>
                  ))}
                </tr>
                <tr>
                  {workspace.strategies.map((strategy) => (
                    <th key={strategy.id}>{strategy.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.measure.id}>
                    <th>{row.value?.title ?? "Unlinked value"}</th>
                    <td>{row.value?.ambition ?? ""}</td>
                    <td>
                      <strong>{row.measure.title}</strong>
                      <span className="target-value">{row.measure.meter}</span>
                    </td>
                    <td>{row.measure.now}</td>
                    <td>{row.measure.target}</td>
                    <td>{row.measure.wish}</td>
                    <td>{row.measure.tolerable}</td>
                    {workspace.strategies.map((strategy) => {
                      const impact = workspace.expectedImpacts.find((item) => item.measureId === row.measure.id && item.strategyId === strategy.id);
                      const calculated = impact ? calculateExpectedImpact(measureForCalculation(row.measure), impact) : undefined;
                      return (
                        <td key={strategy.id}>
                          <button className={`impact-cell ${impactClass(impact, calculated?.calculationWarning)}`} onClick={() => setEditing({ measureId: row.measure.id, strategyId: strategy.id })}>
                            {impact && calculated?.riskAdjustedDelta !== undefined ? (
                              <>
                                <strong className="risk-adjusted-delta">{formatSignedCalculatedValue(calculated.riskAdjustedDelta, row.measure.unit)}</strong>
                                <span className="risk-adjusted-label">risk-adjusted movement</span>
                                <span>Projected {formatCalculatedValue(calculated.riskAdjustedProjectedValue, row.measure.unit)}</span>
                                <span className="raw-impact">Identified {formatSignedCalculatedValue(calculated.rawDelta, row.measure.unit)} from {formatImpactSummary(impact)}</span>
                                <span>Confidence {impact.confidenceScore}</span>
                              </>
                            ) : (
                              <>
                                <strong>{impact ? formatImpactSummary(impact) : "No impact"}</strong>
                                <span>Confidence {impact?.confidenceScore ?? 0}</span>
                              </>
                            )}
                            {calculated?.calculationWarning && <span>{calculated.calculationWarning}</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Create at least one Measurement and one Strategy to use the VDT.</p>
        )}
      </section>
      <aside className="panel">
        <h2>Cell Editor</h2>
        {editing ? (
          <div className="form-stack">
            <p className="note">
              {measureOptionLabels(workspace)[editing.measureId]} {"<-"} {getEntityTitle(workspace, "strategies", editing.strategyId)}
            </p>
            <SelectInput label="Impact mode" value={activeImpact?.impactMode ?? "gapClosure"} options={["absolute", "relative", "gapClosure"]} helpText={impactModeHelp} onChange={(impactMode) => updateCell({ impactMode: impactMode as ExpectedImpactItem["impactMode"] })} />
            <NumberInput label="Impact value" value={activeImpact?.impactValue ?? 0} min={0} step={activeImpact?.impactMode === "absolute" ? 1 : 5} onChange={(impactValue) => updateCell({ impactValue })} />
            <SelectInput label="Numeric direction" value={activeImpact?.numericDirection ?? ""} options={["", "increase", "decrease"]} onChange={(numericDirection) => updateCell({ numericDirection: (numericDirection || undefined) as ExpectedImpactItem["numericDirection"] })} />
            <SelectInput label="Confidence score" value={String(activeImpact?.confidenceScore ?? 0)} options={confidenceOptions} labels={confidenceLabels} onChange={(confidenceScore) => updateCell({ confidenceScore: Number(confidenceScore) as ExpectedImpactItem["confidenceScore"] })} />
            <MultiSelectInput label="Linked evidence" values={activeImpact?.evidenceIds ?? []} options={workspace.evidence.map((evidence) => evidence.id)} labels={optionLabels(workspace, "evidence")} onChange={(evidenceIds) => updateCell({ evidenceIds })} />
            <button onClick={createEvidenceForCell}>Create evidence for this cell</button>
            <TextArea label="Rationale" value={activeImpact?.rationale ?? ""} onChange={(rationale) => updateCell({ rationale })} />
            <TextArea label="Assumptions" value={activeImpact?.assumptions ?? ""} onChange={(assumptions) => updateCell({ assumptions })} />
            <TextArea label="Open questions" value={activeImpact?.openQuestions ?? ""} onChange={(openQuestions) => updateCell({ openQuestions })} />
            {activeCalculated && <CalculationReadout calculated={activeCalculated} unit={activeMeasure?.unit} />}
            <EvidenceStrengthHint impact={activeImpact} workspace={workspace} />
          </div>
        ) : (
          <p className="empty">Select a table cell.</p>
        )}
      </aside>
    </div>
  );
}

function ExportPage({ workspace, setWorkspace }: { workspace: CommitLabWorkspace; setWorkspace: (workspace: CommitLabWorkspace) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const markdown = useMemo(() => buildMarkdown(workspace), [workspace]);
  const json = JSON.stringify(workspace, null, 2);

  const uploadJson = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setWorkspace(normalizeWorkspace(JSON.parse(text)));
  };

  return (
    <div className="export-grid">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Export</h2>
            <p>V1 supports Markdown preview, Markdown download, JSON download, and JSON upload for local iteration.</p>
          </div>
        </div>
        <div className="button-row">
          <button onClick={() => downloadText("commitlab.md", markdown, "text/markdown")}>Download Markdown</button>
          <button onClick={() => downloadText("commitlab.json", json, "application/json")}>Download JSON</button>
          <button onClick={() => fileRef.current?.click()}>Upload JSON</button>
          <input hidden ref={fileRef} type="file" accept="application/json" onChange={(event) => uploadJson(event.target.files?.[0])} />
        </div>
      </section>
      <section className="panel wide">
        <h2>Markdown Preview</h2>
        <pre className="markdown-preview">{markdown}</pre>
      </section>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label>
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="full">
      <span>{label}</span>
      <textarea value={value} rows={4} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  labels,
  helpText,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  helpText?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label title={helpText}>
      <span>
        {label}
        {helpText && <span className="help-indicator" aria-label={helpText}>?</span>}
      </span>
      <select value={value} title={helpText} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? (option || "None")}
          </option>
        ))}
      </select>
    </label>
  );
}

function MultiSelectInput({
  label,
  values,
  options,
  labels,
  onChange
}: {
  label: string;
  values: string[];
  options: string[];
  labels?: Record<string, string>;
  onChange: (values: string[]) => void;
}) {
  const toggle = (option: string) => {
    onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
  };

  return (
    <fieldset className="checkbox-group">
      <legend>{label}</legend>
      {options.length ? (
        options.map((option) => (
          <label key={option}>
            <input checked={values.includes(option)} type="checkbox" onChange={() => toggle(option)} />
            <span>{labels?.[option] ?? option}</span>
          </label>
        ))
      ) : (
        <p className="empty">No evidence created yet.</p>
      )}
    </fieldset>
  );
}

function CalculationReadout({ calculated, unit }: { calculated: ReturnType<typeof calculateExpectedImpact>; unit?: string }) {
  if (calculated.calculationWarning) {
    return <p className="warning-text">Projection unavailable: {calculated.calculationWarning}</p>;
  }
  return (
    <div className="calculation-readout">
      <strong>Calculated projection</strong>
      <span>Raw projected: {formatCalculatedValue(calculated.rawProjectedValue, unit)}</span>
      <span>Raw delta: {formatCalculatedValue(calculated.rawDelta, unit)}</span>
      <span>Risk-adjusted delta: {formatCalculatedValue(calculated.riskAdjustedDelta, unit)}</span>
      <span>Risk-adjusted projected: {formatCalculatedValue(calculated.riskAdjustedProjectedValue, unit)}</span>
    </div>
  );
}

function EvidenceStrengthHint({ impact, workspace }: { impact: ExpectedImpactItem | undefined; workspace: CommitLabWorkspace }) {
  if (!impact?.evidenceIds?.length) return null;
  const linkedEvidence = workspace.evidence.filter((item) => impact.evidenceIds?.includes(item.id) && typeof item.evidenceStrength === "number");
  if (!linkedEvidence.length) return null;
  const average = linkedEvidence.reduce((sum, item) => sum + (item.evidenceStrength ?? 0), 0) / linkedEvidence.length;
  if (Math.abs(average - impact.confidenceScore) < 0.01) return null;
  return <p className="note">Linked evidence average strength is {average.toFixed(1)}. Current confidence score is {impact.confidenceScore}. Consider whether confidence should change.</p>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function itemSummary(item: { id: string; title?: string; value?: string; observedValue?: string }) {
  return item.title || item.value || item.observedValue || item.id;
}

function optionLabels(workspace: CommitLabWorkspace, type: EntityType) {
  const labels: Record<string, string> = { "": "None" };
  for (const item of collectionFor(type, workspace)) {
    labels[item.id] = itemSummary(item);
  }
  return labels;
}

function measureOptionLabels(workspace: CommitLabWorkspace) {
  const labels: Record<string, string> = { "": "None" };
  for (const row of measurementRows(workspace)) {
    labels[row.measure.id] = `${row.value?.title ?? "Unlinked value"} / ${row.measure.title}`;
  }
  return labels;
}

function measurementRows(workspace: CommitLabWorkspace) {
  return workspace.measures.map((measure) => {
    const value = workspace.values.find((item) => item.id === measure.valueId);
    return { measure, value };
  });
}

function impactClass(impact: ExpectedImpactItem | undefined, warning: string | undefined) {
  if (!impact) return "impact-unknown";
  if (warning) return "impact-low";
  if (impact.confidenceScore >= 0.8) return "impact-high";
  if (impact.confidenceScore >= 0.4) return "impact-medium";
  if (impact.confidenceScore > 0) return "impact-low";
  return "impact-none";
}

function pluralEntityType(type: EvidenceItem["linkedEntityType"]): EntityType | undefined {
  if (!type) return undefined;
  if (type === "value") return "values";
  if (type === "measure") return "measures";
  if (type === "target") return "targets";
  if (type === "strategyGroup") return "strategyGroups";
  if (type === "strategy" || type === "strategyOption") return "strategies";
  if (type === "actualMovement") return "actualMovements";
  return "expectedImpacts";
}
