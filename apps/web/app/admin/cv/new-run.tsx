"use client";

import { useState } from "react";
import type { ClientDTO } from "@gradual/shared";
import { Modal } from "@/components/modal";
import { CvUpload } from "@/components/cv-upload";
import { Button, Field, Select } from "@/components/ui";

/** Admin starts an analysis on behalf of a client; it does not count toward the client's quota (D30). */
export function NewRunDialog({ clients, defaultClientId }: { clients: ClientDTO[]; defaultClientId?: string }) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  return (
    <>
      <Button onClick={() => setOpen(true)}>Nuevo análisis</Button>
      <Modal open={open} onOpenChange={setOpen} title="Nuevo análisis" description="Sube el CV de un cliente. No cuenta para su límite mensual y aparecerá en su historial.">
        <div className="space-y-4">
          <Field label="Cliente" htmlFor="cv-client">
            <Select id="cv-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Elige un cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </Select>
          </Field>
          <CvUpload clientId={clientId || undefined} disabled={!clientId} detailBase="/admin/cv" />
        </div>
      </Modal>
    </>
  );
}
