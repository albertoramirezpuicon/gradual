"use client";

import { useState } from "react";
import type { Me } from "@gradual/shared";
import { api } from "@/lib/api";
import { Modal } from "@/components/modal";
import { Alert, Button, Card } from "@/components/ui";

const fmt = (d: string) => new Date(d).toLocaleDateString("es-PE", { timeZone: "America/Lima", dateStyle: "long" });

/** Client asks the consultant to delete their account and data, or cancels a pending request (D52). */
export function DeletionCard({ requestedAt: initial }: { requestedAt: string | null }) {
  const [requestedAt, setRequestedAt] = useState(initial);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE") {
    setLoading(true);
    setError(null);
    try {
      const me = await api<Me>("/auth/deletion-request", { method, body: method === "POST" ? {} : undefined });
      setRequestedAt(me.deletionRequestedAt);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-3 p-6">
      <h2 className="font-bold">Eliminar mi cuenta</h2>
      {error ? <Alert>{error}</Alert> : null}
      {requestedAt ? (
        <>
          <Alert tone="warning">
            Solicitaste eliminar tu cuenta el {fmt(requestedAt)}. Tu consultora la eliminará pronto junto con todos tus datos.
          </Alert>
          <Button variant="secondary" size="sm" onClick={() => call("DELETE")} loading={loading}>
            Cancelar solicitud
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            Puedes pedir que eliminemos tu cuenta y todos tus datos: avance en tus rutas, análisis de CV y archivos. Esta acción no se puede deshacer una vez realizada.
          </p>
          <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={() => setOpen(true)}>
            Solicitar eliminación
          </Button>
        </>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="¿Solicitar la eliminación de tu cuenta?"
        description="Tu consultora recibirá la solicitud y eliminará tu cuenta con todos tus datos. Hasta entonces podrás seguir ingresando y cancelar la solicitud."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => call("POST")} loading={loading}>
            Solicitar eliminación
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
