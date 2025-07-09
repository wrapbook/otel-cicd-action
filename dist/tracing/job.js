"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.traceWorkflowRunJobs = void 0;
const api_1 = require("@opentelemetry/api");
const core = __importStar(require("@actions/core"));
const step_1 = require("./step");
const github_1 = require("@actions/github");
async function traceWorkflowRunJobs({ provider, workflowRunJobs, }) {
    const tracer = provider.getTracer("otel-cicd-action");
    const octokit = (0, github_1.getOctokit)(core.getInput("githubToken"));
    const startTime = new Date(workflowRunJobs.workflowRun.run_started_at ||
        workflowRunJobs.workflowRun.created_at);
    let headRef = undefined;
    let baseRef = undefined;
    let baseSha = undefined;
    let pull_requests = {};
    if (workflowRunJobs.workflowRun.pull_requests &&
        workflowRunJobs.workflowRun.pull_requests.length > 0) {
        headRef = workflowRunJobs.workflowRun.pull_requests[0].head?.ref;
        baseRef = workflowRunJobs.workflowRun.pull_requests[0].base?.ref;
        baseSha = workflowRunJobs.workflowRun.pull_requests[0].base?.sha;
        const prNumber = workflowRunJobs.workflowRun.pull_requests[0].number;
        const labelRequest = await octokit.rest.issues.listLabelsOnIssue({
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            issue_number: prNumber,
        });
        const labels = labelRequest.data.map((l) => l.name).join(", ");
        pull_requests = workflowRunJobs.workflowRun.pull_requests.reduce((result, pr, idx) => {
            const prefix = `github.pull_requests.${idx}`;
            return {
                ...result,
                [`${prefix}.id`]: pr.id,
                [`${prefix}.url`]: pr.url,
                [`${prefix}.number`]: pr.number,
                [`${prefix}.labels`]: labels,
                [`${prefix}.head.sha`]: pr.head.sha,
                [`${prefix}.head.ref`]: pr.head.ref,
                [`${prefix}.head.repo.id`]: pr.head.repo.id,
                [`${prefix}.head.repo.url`]: pr.head.repo.url,
                [`${prefix}.head.repo.name`]: pr.head.repo.name,
                [`${prefix}.base.ref`]: pr.base.ref,
                [`${prefix}.base.sha`]: pr.base.sha,
                [`${prefix}.base.repo.id`]: pr.base.repo.id,
                [`${prefix}.base.repo.url`]: pr.base.repo.url,
                [`${prefix}.base.repo.name`]: pr.base.repo.name,
            };
        }, {});
    }
    const rootSpan = tracer.startSpan(workflowRunJobs.workflowRun.name ||
        `${workflowRunJobs.workflowRun.workflow_id}`, {
        attributes: {
            "github.workflow_id": workflowRunJobs.workflowRun.workflow_id,
            "github.run_id": workflowRunJobs.workflowRun.id,
            "github.run_number": workflowRunJobs.workflowRun.run_number,
            "github.run_attempt": workflowRunJobs.workflowRun.run_attempt || 1,
            "github.html_url": workflowRunJobs.workflowRun.html_url,
            "github.workflow_url": workflowRunJobs.workflowRun.workflow_url,
            "github.event": workflowRunJobs.workflowRun.event,
            "github.workflow": workflowRunJobs.workflowRun.name || undefined,
            "github.conclusion": workflowRunJobs.workflowRun.conclusion || undefined,
            "github.created_at": workflowRunJobs.workflowRun.created_at,
            "github.updated_at": workflowRunJobs.workflowRun.updated_at,
            "github.run_started_at": workflowRunJobs.workflowRun.run_started_at,
            "github.author_name": workflowRunJobs.workflowRun.head_commit?.author?.name || undefined,
            "github.author_email": workflowRunJobs.workflowRun.head_commit?.author?.email || undefined,
            "github.head_commit.id": workflowRunJobs.workflowRun.head_commit?.id || undefined,
            "github.head_commit.tree_id": workflowRunJobs.workflowRun.head_commit?.tree_id || undefined,
            "github.head_commit.author.name": workflowRunJobs.workflowRun.head_commit?.author?.email || undefined,
            "github.head_commit.author.email": workflowRunJobs.workflowRun.head_commit?.author?.email || undefined,
            "github.head_commit.committer.name": workflowRunJobs.workflowRun.head_commit?.committer?.email ||
                undefined,
            "github.head_commit.committer.email": workflowRunJobs.workflowRun.head_commit?.committer?.email ||
                undefined,
            "github.head_commit.message": workflowRunJobs.workflowRun.head_commit?.message || undefined,
            "github.head_commit.timestamp": workflowRunJobs.workflowRun.head_commit?.timestamp || undefined,
            "github.head_branch": workflowRunJobs.workflowRun.head_branch || undefined,
            "github.head_sha": workflowRunJobs.workflowRun.head_sha,
            "github.head_ref": headRef,
            "github.base_ref": baseRef,
            "github.base_sha": baseSha,
            error: workflowRunJobs.workflowRun.conclusion === "failure",
            ...pull_requests,
        },
        root: true,
        startTime,
    }, api_1.ROOT_CONTEXT);
    core.debug(`TraceID: ${rootSpan.spanContext().traceId}`);
    let code = api_1.SpanStatusCode.OK;
    if (workflowRunJobs.workflowRun.conclusion === "failure") {
        code = api_1.SpanStatusCode.ERROR;
    }
    rootSpan.setStatus({ code });
    core.debug(`Root Span: ${rootSpan.spanContext().traceId}: ${workflowRunJobs.workflowRun.created_at}`);
    try {
        if (workflowRunJobs.jobs.length > 0) {
            const firstJob = workflowRunJobs.jobs[0];
            const queueCtx = api_1.trace.setSpan(api_1.ROOT_CONTEXT, rootSpan);
            const queueSpan = tracer.startSpan("Queued", { startTime }, queueCtx);
            queueSpan.end(new Date(firstJob.started_at));
        }
        for (let i = 0; i < workflowRunJobs.jobs.length; i++) {
            const job = workflowRunJobs.jobs[i];
            if (workflowRunJobs.jobs[i].conclusion === "skipped") {
                core.info(`Job ${job.id} was skipped, not tracing.`);
            }
            else {
                const annotations = [];
                // To limit API usage, only get annotations for failed jobs
                if (workflowRunJobs.jobs[i].conclusion === "failure") {
                    const annotationsResponse = await octokit.rest.checks.listAnnotations({
                        owner: github_1.context.repo.owner,
                        repo: github_1.context.repo.repo,
                        check_run_id: job.id,
                    });
                    core.debug(`Found JobAnnotations Count: ${annotationsResponse.data.length}`);
                    annotations.push(...annotationsResponse.data.filter((a) => 
                    // if annotation_level is failure, we want to only include those from .github
                    (a.annotation_level === "failure" && a.path === ".github") ||
                        // if annotation_level is notice, we want to include all
                        a.annotation_level === "notice"));
                }
                await traceWorkflowRunJob({
                    parentSpan: rootSpan,
                    parentContext: api_1.ROOT_CONTEXT,
                    trace: api_1.trace,
                    tracer,
                    job,
                    jobAnnotations: annotations,
                    workflowArtifacts: workflowRunJobs.workflowRunArtifacts,
                });
            }
        }
    }
    finally {
        rootSpan.end(new Date(workflowRunJobs.workflowRun.updated_at));
    }
    return rootSpan.spanContext();
}
exports.traceWorkflowRunJobs = traceWorkflowRunJobs;
async function traceWorkflowRunJob({ parentContext, trace, parentSpan, tracer, job, jobAnnotations, workflowArtifacts, }) {
    core.debug(`Trace Job ${job.id}`);
    if (!job.completed_at) {
        console.warn(`Job ${job.id} is not completed yet`);
        return;
    }
    job.name;
    const ctx = trace.setSpan(parentContext, parentSpan);
    const startTime = new Date(job.started_at);
    const completedTime = new Date(job.completed_at);
    const annotationMessages = jobAnnotations
        .map((a) => a.message)
        .join(";");
    const span = tracer.startSpan(job.name, {
        attributes: {
            "github.job.id": job.id,
            "github.job.name": job.name,
            "github.job.run_id": job.run_id,
            "github.job.run_attempt": job.run_attempt || 1,
            "github.job.runner_group_id": job.runner_group_id || undefined,
            "github.job.runner_group_name": job.runner_group_name || undefined,
            "github.job.runner_name": job.runner_name || undefined,
            "github.job.conclusion": job.conclusion || undefined,
            "github.job.labels": job.labels.join(", ") || undefined,
            "github.job.started_at": job.started_at || undefined,
            "github.job.completed_at": job.completed_at || undefined,
            "github.conclusion": job.conclusion || undefined,
            "github.job.annotations": annotationMessages,
            "github.head_branch": job.head_branch || undefined,
            "github.head_sha": job.head_sha || undefined,
            error: job.conclusion === "failure",
        },
        startTime,
    }, ctx);
    const spanId = span.spanContext().spanId;
    core.debug(`Job Span<${spanId}>: Started<${job.started_at}>`);
    try {
        let code = api_1.SpanStatusCode.OK;
        if (job.conclusion === "failure") {
            code = api_1.SpanStatusCode.ERROR;
        }
        span.setStatus({ code });
        const numSteps = job.steps?.length || 0;
        core.debug(`Trace ${numSteps} Steps`);
        const enableStepTracing = core.getBooleanInput("enableStepTracing");
        if (job.steps !== undefined && enableStepTracing) {
            for (let i = 0; i < job.steps.length; i++) {
                const step = job.steps[i];
                await (0, step_1.traceWorkflowRunStep)({
                    job,
                    parentContext: ctx,
                    trace,
                    parentSpan: span,
                    tracer,
                    workflowArtifacts,
                    step,
                });
            }
        }
    }
    finally {
        core.debug(`Job Span<${spanId}>: Ended<${job.completed_at}>`);
        // Some skipped and post jobs return completed_at dates that are older than started_at
        span.end(new Date(Math.max(startTime.getTime(), completedTime.getTime())));
    }
}
//# sourceMappingURL=job.js.map