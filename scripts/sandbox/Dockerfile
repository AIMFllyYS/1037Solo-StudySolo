# Official compatible headless runtime: no tenant data or credentials in this image.
FROM fc-e2b-registry.cn-hangzhou.cr.aliyuncs.com/runtime/base:v0.0.49
USER root
COPY scripts/sandbox/template-dependencies.sh /opt/studysolo-build/template-dependencies.sh
RUN bash /opt/studysolo-build/template-dependencies.sh
COPY lib/sandbox/skill-packs/ /opt/studysolo/skills/
COPY scripts/sandbox/verify-renderers.sh /opt/studysolo/verify-renderers.sh
RUN chmod -R a+rX /opt/studysolo/skills
# Preserve the official runtime's envd startup/entrypoint. Job commands run only
# after the website's trusted namespace/UID-mapping preflight passes.
