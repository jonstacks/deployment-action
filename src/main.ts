import * as core from "@actions/core";
import * as github from "@actions/github";

type DeploymentState =
  | "error"
  | "failure"
  | "inactive"
  | "in_progress"
  | "queued"
  | "pending"
  | "success";

async function run() {
  try {
    const context = github.context;
    const token = core.getInput("token", { required: true });
    const octokit = github.getOctokit(token);

    let contextSha = context.sha;
    let contextRef = context.ref;

    core.debug(JSON.stringify(context.payload, null, 2));

    if (context.payload.pull_request) {
      // Pull requests can be tricky with github actions as the GITHUB_HEAD_REF will
      // actually point to a merge commit with the main branch, in order to display
      // the deployment on the pull request page, the 'ref' needs to be the head
      // ref of the latest commit on the head branch of the PR and not the merge head
      // ref(GITHUB_HEAD_REF)
      const pr = await octokit.pulls.get({
        ...context.repo,
        pull_number: context.payload.pull_request.number,
      });
      core.debug(`PR Head: ${JSON.stringify(pr.data.head)}`);
      contextSha = pr.data.head.sha;
      contextRef = contextSha;
    }

    const ref = core.getInput("ref", { required: false }) || contextRef;
    const sha = core.getInput("sha", { required: false }) || contextSha;
    const logUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/commit/${sha}/checks`;

    const url = core.getInput("target_url", { required: false }) || logUrl;
    const environment =
      core.getInput("environment", { required: false }) || "production";
    const description = core.getInput("description", { required: false });
    const initialStatus =
      (core.getInput("initial_status", {
        required: false,
      }) as DeploymentState) || "pending";
    const autoMergeStringInput = core.getInput("auto_merge", {
      required: false,
    });
    const transientEnvironmentStringInput = core.getInput("transient_environment", {
      required: false,
    });

    const auto_merge: boolean = autoMergeStringInput === "true";
    const transient_environment = transientEnvironmentStringInput === "true";

    const deployment = await octokit.repos.createDeployment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: ref,
      sha: sha,
      required_contexts: [],
      environment,
      transient_environment,
      auto_merge,
      description,
    });

    if (!("id" in deployment.data)) {
      // TODO: Should 202 be handled differently? Either way we get no ID
      throw new Error(deployment.data.message);
    }

    await octokit.repos.createDeploymentStatus({
      ...context.repo,
      deployment_id: deployment.data.id,
      state: initialStatus,
      log_url: logUrl,
      environment_url: url,
    });

    core.setOutput("deployment_id", deployment.data.id.toString());
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

run();
