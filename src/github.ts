import { Context } from "@actions/github/lib/context";
import { GitHub } from "@actions/github/lib/utils";
import * as core from "@actions/core";
import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import * as JSZip from "jszip";
import * as fs from "fs";
import * as artifact from "@actions/artifact";
import * as path from "path";

export type OctoKit = InstanceType<typeof GitHub>;
export type GetWorkflowRunType =
  RestEndpointMethodTypes["actions"]["getWorkflowRun"]["response"];
export type ListJobsForWorkflowRunType =
  RestEndpointMethodTypes["actions"]["listJobsForWorkflowRun"]["response"];
export type WorkflowRunJob = ListJobsForWorkflowRunType["data"]["jobs"][0];
export type WorkflowRunJobStep = {
  status: "queued" | "in_progress" | "completed";
  conclusion?: string | null;
  id?: string;
  name: string;
  number: number;
  started_at?: string | null;
  completed_at?: string | null;
};
export type WorkflowRun = GetWorkflowRunType["data"];
export type ListWorkflowRunArtifactsResponse =
  RestEndpointMethodTypes["actions"]["listWorkflowRunArtifacts"]["response"];

export type WorkflowArtifact =
  ListWorkflowRunArtifactsResponse["data"]["artifacts"][0];

export type WorkflowArtifactMap = {
  [job: string]: {
    [step: string]: WorkflowArtifactDownload;
  };
};

export type WorkflowArtifactDownload = {
  jobName: string;
  stepName: string;
  path: string;
};

export type WorkflowArtifactLookup = (
  jobName: string,
  stepName: string,
) => WorkflowArtifactDownload | undefined;

export type WorkflowRunJobs = {
  workflowRun: WorkflowRun;
  jobs: WorkflowRunJob[];
  workflowRunArtifacts: WorkflowArtifactLookup;
};

export type WorkflowRunJobAnnotationsResponse =
  RestEndpointMethodTypes["checks"]["listAnnotations"]["response"];
export type JobAnnotation = WorkflowRunJobAnnotationsResponse["data"][0];

export async function listWorkflowRunArtifacts(
  context: Context,
  octokit: InstanceType<typeof GitHub>,
  runId: number,
): Promise<WorkflowArtifactLookup> {
  let artifactsLookup: WorkflowArtifactMap = {};

  /* istanbul ignore if */
  if (runId === context.runId) {
    artifactsLookup = await getSelfArtifactMap();
  } else {
    artifactsLookup = await getWorkflowRunArtifactMap(context, octokit, runId);
  }
  return (jobName: string, stepName: string) => {
    try {
      return artifactsLookup[jobName][stepName];
    } catch (e) {
      /* istanbul ignore next */
      return undefined;
    }
  };
}

async function getWorkflowRunArtifactMap(
  context: Context,
  octokit: InstanceType<typeof GitHub>,
  runId: number,
): Promise<WorkflowArtifactMap> {
  const artifactsList: WorkflowArtifact[] = [];
  const pageSize = 100;

  for (let page = 1, hasNext = true; hasNext; page++) {
    const listArtifactsResponse =
      await octokit.rest.actions.listWorkflowRunArtifacts({
        ...context.repo,
        run_id: runId,
        page,
        per_page: pageSize,
      });
    artifactsList.push(...listArtifactsResponse.data.artifacts);
    hasNext = artifactsList.length < listArtifactsResponse.data.total_count;
  }

  const artifactsLookup: WorkflowArtifactMap = await artifactsList.reduce(
    async (resultP, artifact) => {
      const result = await resultP;
      const match = artifact.name.match(
        /\{(?<jobName>.*)\}\{(?<stepName>.*)\}/,
      );
      const next: WorkflowArtifactMap = { ...result };
      /* istanbul ignore next */
      if (match?.groups?.["jobName"] && match?.groups?.["stepName"]) {
        const { jobName, stepName } = match.groups;
        core.debug(`Found Artifact for Job<${jobName}> Step<${stepName}>`);
        if (!(jobName in next)) {
          next[jobName] = {};
        }
        const downloadResponse = await octokit.rest.actions.downloadArtifact({
          ...context.repo,
          artifact_id: artifact.id,
          archive_format: "zip",
        });

        const response = await fetch(downloadResponse.url);
        const buf = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const writeStream = fs.createWriteStream(`${artifact.name}.log`);
        try {
          zip.files[Object.keys(zip.files)[0]].nodeStream().pipe(writeStream);
          await new Promise((fulfill) => writeStream.on("finish", fulfill));
          core.debug(`Downloaded Artifact ${writeStream.path.toString()}`);
          next[jobName][stepName] = {
            jobName,
            stepName,
            path: writeStream.path.toString(),
          };
        } finally {
          writeStream.close();
        }
      }

      return next;
    },
    Promise.resolve({}),
  );
  return artifactsLookup;
}

/* istanbul ignore next */
async function getSelfArtifactMap(): Promise<WorkflowArtifactMap> {
  const client = artifact.create();
  const responses: artifact.DownloadResponse[] =
    await client.downloadAllArtifacts();
  const artifactsMap: WorkflowArtifactMap = responses.reduce(
    (result, { artifactName, downloadPath }) => {
      const next: WorkflowArtifactMap = { ...result };
      const match = artifactName.match(/\{(?<jobName>.*)\}\{(?<stepName>.*)\}/);
      if (match?.groups?.["jobName"] && match?.groups?.["stepName"]) {
        const { jobName, stepName } = match.groups;
        core.debug(`Found Artifact for Job<${jobName}> Step<${stepName}>`);
        if (!(jobName in next)) {
          next[jobName] = {};
        }
        const artifactDirFiles = fs.readdirSync(downloadPath);
        if (artifactDirFiles && artifactDirFiles.length > 0) {
          next[jobName][stepName] = {
            jobName,
            stepName,
            path: path.join(downloadPath, artifactDirFiles[0]),
          };
        }
      }
      return next;
    },
    {},
  );

  return artifactsMap;
}

// TODO add test coverage
/* istanbul ignore next */
async function listJobsForWorkflowRun(
  context: Context,
  octokit: InstanceType<typeof GitHub>,
  runId: number,
): Promise<WorkflowRunJob[]> {
  const jobs: WorkflowRunJob[] = [];
  const pageSize = 100;

  for (let page = 1, hasNext = true; hasNext; page++) {
    const listJobsForWorkflowRunResponse: ListJobsForWorkflowRunType =
      await octokit.rest.actions.listJobsForWorkflowRun({
        ...context.repo,
        run_id: runId,
        filter: "latest", // risk of missing a run if re-run happens between Action trigger and this query
        page,
        per_page: pageSize,
      });

    jobs.push(...listJobsForWorkflowRunResponse.data.jobs);
    hasNext = jobs.length < listJobsForWorkflowRunResponse.data.total_count;
  }

  return jobs;
}

// TODO add test coverage
/* istanbul ignore next */
export async function getWorkflowRunJobs(
  context: Context,
  octokit: InstanceType<typeof GitHub>,
  runId: number,
): Promise<WorkflowRunJobs> {
  const getWorkflowRunResponse: GetWorkflowRunType =
    await octokit.rest.actions.getWorkflowRun({
      ...context.repo,
      run_id: runId,
    });

  const workflowRunArtifacts = await listWorkflowRunArtifacts(
    context,
    octokit,
    runId,
  );
  const jobs = await listJobsForWorkflowRun(context, octokit, runId);

  const workflowRunJobs = {
    workflowRun: getWorkflowRunResponse.data,
    jobs,
    workflowRunArtifacts,
  };
  return workflowRunJobs;
}
