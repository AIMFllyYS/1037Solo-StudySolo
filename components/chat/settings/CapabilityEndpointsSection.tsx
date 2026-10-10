"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useSettings } from "@/lib/stores/settings";
import { formatImageGenError } from "@/lib/ai/imageGenError";
import {
  EMPTY_CAPABILITY_ENDPOINTS,
  IMAGE_API_STYLES,
  capabilityNeedsForImageGen,
  selectCapabilityEndpointsForRequest,
  type ImageApiStyle,
} from "@/lib/ai/capabilityEndpoints";
import { inputCls, labelCls } from "./_shared";
import AppSelect from "@/components/ui/AppSelect";
import { useT } from "@/lib/i18n";
import SettingsDisclosure from "./SettingsDisclosure";

export function CapabilityEndpointsSection() {
  const capabilityEndpoints = useSettings((s) => s.capabilityEndpoints) ?? EMPTY_CAPABILITY_ENDPOINTS;
  const setCapabilityEndpoints = useSettings((s) => s.setCapabilityEndpoints);
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const defaultImageModelId = useSettings((s) => s.defaultImageModelId);
  const selectedModelId = useSettings((s) => s.selectedModelId);
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeMessage, setProbeMessage] = useState<string | null>(null);

  const probeImageEndpoint = async () => {
    setProbeBusy(true);
    setProbeMessage(null);
    try {
      const res = await fetch("/api/image-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          probe: true,
          modelId: selectedModelId,
          customApiGroups,
          defaultImageModelId,
          capabilityEndpoints: selectCapabilityEndpointsForRequest(
            capabilityEndpoints,
            capabilityNeedsForImageGen(),
          ),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setProbeMessage(formatImageGenError(res.status, body));
        return;
      }
      setProbeMessage(typeof body?.message === "string" ? body.message : t("settings.capability.probeOk"));
    } catch (err) {
      setProbeMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setProbeBusy(false);
    }
  };

  return (
    <SettingsDisclosure expanded={expanded} onToggle={() => setExpanded((v) => !v)}
      icon={<KeyRound size={14} />} title={t("settings.capability.title")} meta={t("settings.capability.meta")}>
        <div className="flex flex-col gap-3">
          <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            {t("settings.capability.desc")}
          </p>

          <fieldset className="flex flex-col gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] p-3">
            <legend className="px-1 text-[12px] font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("settings.capability.image")}
            </legend>
            <div>
              <label className={labelCls}>Base URL</label>
              <input
                className={inputCls}
                value={capabilityEndpoints.imageBaseUrl}
                onChange={(e) => setCapabilityEndpoints({ imageBaseUrl: e.target.value })}
                placeholder={t("settings.capability.platformDefault")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>API Key</label>
              <input
                className={inputCls}
                type="password"
                value={capabilityEndpoints.imageApiKey}
                onChange={(e) => setCapabilityEndpoints({ imageApiKey: e.target.value })}
                placeholder={t("settings.capability.platformDefault")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>{t("settings.capability.modelId")}</label>
              <input
                className={inputCls}
                value={capabilityEndpoints.imageModelId}
                onChange={(e) => setCapabilityEndpoints({ imageModelId: e.target.value })}
                placeholder={t("settings.capability.builtinImageModel")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>{t("settings.capability.imageApiStyle")}</label>
              <AppSelect label={t("settings.capability.imageApiStyleAria")} value={capabilityEndpoints.imageApiStyle}
                onValueChange={(imageApiStyle: ImageApiStyle) => setCapabilityEndpoints({ imageApiStyle })}
                options={IMAGE_API_STYLES.map((style) => ({ value: style, label: style }))} />
            </div>
            <button
              type="button"
              onClick={() => void probeImageEndpoint()}
              disabled={probeBusy}
              className="press self-start rounded-lg border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--md-sys-color-on-surface)]"
            >
              {t(probeBusy ? "settings.capability.probing" : "settings.capability.probe")}
            </button>
            {probeMessage && (
              <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                {probeMessage}
              </p>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] p-3">
            <legend className="px-1 text-[12px] font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("settings.capability.embedding")}
            </legend>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              {t("settings.capability.embeddingDesc")}
            </p>
            <div>
              <label className={labelCls}>Base URL</label>
              <input
                className={inputCls}
                value={capabilityEndpoints.embeddingBaseUrl}
                onChange={(e) => setCapabilityEndpoints({ embeddingBaseUrl: e.target.value })}
                placeholder={t("settings.capability.platformDefault")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>API Key</label>
              <input
                className={inputCls}
                type="password"
                value={capabilityEndpoints.embeddingApiKey}
                onChange={(e) => setCapabilityEndpoints({ embeddingApiKey: e.target.value })}
                placeholder={t("settings.capability.platformDefault")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>{t("settings.capability.modelId")}</label>
              <input
                className={inputCls}
                value={capabilityEndpoints.embeddingModelId}
                onChange={(e) => setCapabilityEndpoints({ embeddingModelId: e.target.value })}
                placeholder={t("settings.capability.platformDefault")}
                autoComplete="off"
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] p-3">
            <legend className="px-1 text-[12px] font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("settings.capability.rerank")}
            </legend>
            <div>
              <label className={labelCls}>Base URL</label>
              <input
                className={inputCls}
                value={capabilityEndpoints.rerankBaseUrl}
                onChange={(e) => setCapabilityEndpoints({ rerankBaseUrl: e.target.value })}
                placeholder={t("settings.capability.platformDefault")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>API Key</label>
              <input
                className={inputCls}
                type="password"
                value={capabilityEndpoints.rerankApiKey}
                onChange={(e) => setCapabilityEndpoints({ rerankApiKey: e.target.value })}
                placeholder={t("settings.capability.platformDefault")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>{t("settings.capability.modelId")}</label>
              <input
                className={inputCls}
                value={capabilityEndpoints.rerankModelId}
                onChange={(e) => setCapabilityEndpoints({ rerankModelId: e.target.value })}
                placeholder={t("settings.capability.platformDefault")}
                autoComplete="off"
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] p-3">
            <legend className="px-1 text-[12px] font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("settings.capability.webSearch")}
            </legend>
            <p className="text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
              {t("settings.capability.webSearchHint")}
            </p>
            <div>
              <label className={labelCls}>{t("settings.capability.zhipuKey")}</label>
              <input
                className={inputCls}
                type="password"
                value={capabilityEndpoints.webSearchApiKey}
                onChange={(e) => setCapabilityEndpoints({ webSearchApiKey: e.target.value })}
                placeholder={t("settings.capability.zhipuPlaceholder")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>{t("settings.capability.kimiSearchKey")}</label>
              <input
                className={inputCls}
                type="password"
                value={capabilityEndpoints.kimiSearchApiKey}
                onChange={(e) => setCapabilityEndpoints({ kimiSearchApiKey: e.target.value })}
                placeholder={t("settings.capability.kimiSearchPlaceholder")}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls}>{t("settings.capability.perplexitySearchKey")}</label>
              <input
                className={inputCls}
                type="password"
                value={capabilityEndpoints.perplexitySearchApiKey}
                onChange={(e) => setCapabilityEndpoints({ perplexitySearchApiKey: e.target.value })}
                placeholder={t("settings.capability.perplexitySearchPlaceholder")}
                autoComplete="off"
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] p-3">
            <legend className="px-1 text-[12px] font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("settings.capability.unsplash")}
            </legend>
            <div>
              <label className={labelCls}>Unsplash Access Key</label>
              <input
                className={inputCls}
                type="password"
                value={capabilityEndpoints.unsplashAccessKey}
                onChange={(e) => setCapabilityEndpoints({ unsplashAccessKey: e.target.value })}
                placeholder={t("settings.capability.unsplashPlaceholder")}
                autoComplete="off"
              />
            </div>
          </fieldset>
        </div>
    </SettingsDisclosure>
  );
}
