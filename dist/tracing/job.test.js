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
const jest_mock_extended_1 = require("jest-mock-extended");
const core = __importStar(require("@actions/core"));
const job_1 = require("./job");
const github_1 = require("@actions/github");
// Mock dependencies
jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
    getOctokit: jest.fn(),
    context: {
        repo: {
            owner: "test-owner",
            repo: "test-repo",
        },
    },
}));
describe("traceWorkflowRunJobs", () => {
    let mockProvider;
    let mockWorkflowRunJobs;
    let mockOctokit;
    beforeEach(() => {
        jest.resetAllMocks();
        // Mock provider
        mockProvider = (0, jest_mock_extended_1.mock)({
            getTracer: jest.fn().mockReturnValue({
                startSpan: jest.fn().mockReturnValue({
                    spanContext: jest.fn().mockReturnValue({
                        traceId: "test-trace-id",
                        spanId: "test-span-id",
                    }),
                    setStatus: jest.fn(),
                    end: jest.fn(),
                }),
            }),
        });
        // GitHub context is mocked in the jest.mock call
        mockOctokit = {
            rest: {
                checks: {
                    listAnnotations: jest.fn().mockResolvedValue({
                        data: [],
                    }),
                },
                issues: {
                    listLabelsOnIssue: jest.fn().mockResolvedValue({
                        data: [],
                    }),
                },
            },
        };
        // Mock GitHub getOctokit
        github_1.getOctokit.mockReturnValue(mockOctokit);
        // Mock core.getInput and other core functions
        core.getInput.mockReturnValue("mock-token");
        core.getBooleanInput.mockReturnValue(false);
        core.debug.mockImplementation(jest.fn());
        core.info.mockImplementation(jest.fn());
        // Create a mock workflow run jobs object
        mockWorkflowRunJobs = (0, jest_mock_extended_1.mock)({
            workflowRun: {
                id: 123,
                name: "Test Workflow",
                workflow_id: 456,
                run_number: 1,
                run_attempt: 1,
                html_url: "https://github.com/test-owner/test-repo/actions/runs/123",
                workflow_url: "https://github.com/test-owner/test-repo/actions/workflows/456",
                event: "push",
                conclusion: null,
                created_at: "2023-01-01T00:00:00Z",
                updated_at: "2023-01-01T00:10:00Z",
                run_started_at: "2023-01-01T00:00:00Z",
                head_sha: "abcdef123456",
                head_branch: "main",
            },
            jobs: [
                {
                    id: 789,
                    name: "Test Job",
                    run_id: 123,
                    run_url: "https://github.com/test-owner/test-repo/actions/runs/123",
                    node_id: "node123",
                    head_sha: "abcdef123456",
                    url: "https://api.github.com/repos/test-owner/test-repo/actions/jobs/789",
                    html_url: "https://github.com/test-owner/test-repo/actions/runs/123/jobs/789",
                    status: "completed",
                    conclusion: "failure",
                    started_at: "2023-01-01T00:00:00Z",
                    completed_at: "2023-01-01T00:10:00Z",
                    runner_name: "test-runner",
                    runner_group_id: 1,
                    runner_group_name: "Default",
                    steps: [],
                    labels: ["ubuntu-latest"],
                },
            ],
            workflowRunArtifacts: jest.fn(),
        });
    });
    describe("annotation filtering", () => {
        it("should filter failure annotations to only include those from .github path", async () => {
            // Setup the mock annotations response
            const mockAnnotations = [
                {
                    path: ".github",
                    start_line: 1,
                    end_line: 1,
                    start_column: null,
                    end_column: null,
                    annotation_level: "failure",
                    title: null,
                    message: "Failure from GitHub workflow",
                    raw_details: null,
                    blob_href: "https://github.com/test-owner/test-repo/blob/abcdef/.github/file.yml",
                },
                {
                    path: "src/app",
                    start_line: 1,
                    end_line: 1,
                    start_column: null,
                    end_column: null,
                    annotation_level: "failure",
                    title: null,
                    message: "Failure from application code",
                    raw_details: null,
                    blob_href: "https://github.com/test-owner/test-repo/blob/abcdef/src/app/file.js",
                },
            ];
            // Configure the mock to return our annotations
            mockOctokit.rest.checks.listAnnotations.mockResolvedValueOnce({
                data: mockAnnotations,
            });
            // Call the function
            await (0, job_1.traceWorkflowRunJobs)({
                provider: mockProvider,
                workflowRunJobs: mockWorkflowRunJobs,
            });
            // Verify that only the GitHub failure was included
            expect(mockOctokit.rest.checks.listAnnotations).toHaveBeenCalledWith({
                owner: "test-owner",
                repo: "test-repo",
                check_run_id: 789,
            });
        });
        it("should include all notice annotations regardless of path", async () => {
            // Setup the mock annotations response with both failure and notice annotations
            const mockAnnotations = [
                {
                    path: ".github",
                    start_line: 1,
                    end_line: 1,
                    start_column: null,
                    end_column: null,
                    annotation_level: "failure",
                    title: null,
                    message: "Failure from GitHub workflow",
                    raw_details: null,
                    blob_href: "https://github.com/test-owner/test-repo/blob/abcdef/.github/file.yml",
                },
                {
                    path: "src/app",
                    start_line: 1,
                    end_line: 1,
                    start_column: null,
                    end_column: null,
                    annotation_level: "failure",
                    title: null,
                    message: "Failure from application code",
                    raw_details: null,
                    blob_href: "https://github.com/test-owner/test-repo/blob/abcdef/src/app/file.js",
                },
                {
                    path: ".github",
                    start_line: 1,
                    end_line: 1,
                    start_column: null,
                    end_column: null,
                    annotation_level: "notice",
                    title: null,
                    message: "Notice from GitHub workflow",
                    raw_details: null,
                    blob_href: "https://github.com/test-owner/test-repo/blob/abcdef/.github/file.yml",
                },
                {
                    path: "src/app",
                    start_line: 1,
                    end_line: 1,
                    start_column: null,
                    end_column: null,
                    annotation_level: "notice",
                    title: null,
                    message: "Notice from application code",
                    raw_details: null,
                    blob_href: "https://github.com/test-owner/test-repo/blob/abcdef/src/app/file.js",
                },
            ];
            // Configure the mock to return our annotations
            mockOctokit.rest.checks.listAnnotations.mockResolvedValueOnce({
                data: mockAnnotations,
            });
            // Call the function
            await (0, job_1.traceWorkflowRunJobs)({
                provider: mockProvider,
                workflowRunJobs: mockWorkflowRunJobs,
            });
            // Verify that correct annotations were included (failures from .github + all notices)
            expect(mockOctokit.rest.checks.listAnnotations).toHaveBeenCalledWith({
                owner: "test-owner",
                repo: "test-repo",
                check_run_id: 789,
            });
        });
    });
});
//# sourceMappingURL=job.test.js.map