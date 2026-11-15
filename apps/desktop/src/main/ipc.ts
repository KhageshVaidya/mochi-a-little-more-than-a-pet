import { ipcMain, webContents, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  eventChannels,
  invokeChannels,
  type EventChannel,
  type EventPayload,
  type InvokeChannel,
  type WindowRole,
} from '@orbital/contracts';
import type { z } from 'zod';

type Handler<C extends InvokeChannel> = (
  request: z.output<(typeof invokeChannels)[C]['request']>,
  ctx: { role: WindowRole; sender: WebContents },
) => z.input<(typeof invokeChannels)[C]['response']> | Promise<z.input<(typeof invokeChannels)[C]['response']>>;

/**
 * Allow-listed, validated IPC.
 *  - Only channels in the contract can be registered.
 *  - The sender must be a known ORBITAL window whose role is permitted for the channel.
 *  - Only the top-level frame may call (no iframes).
 *  - Requests and responses are parsed with the contract's zod schemas.
 */
export class IpcRouter {
  private readonly roles = new Map<number, WindowRole>();

  attach(contents: WebContents, role: WindowRole): void {
    this.roles.set(contents.id, role);
    contents.once('destroyed', () => this.roles.delete(contents.id));
  }

  handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
    const spec = invokeChannels[channel];
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, raw: unknown) => {
      const role = this.authorize(event, spec.windows, channel);
      const request = spec.request.parse(raw);
      const response = await handler(request as never, { role, sender: event.sender });
      return spec.response.parse(response);
    });
  }

  send<C extends EventChannel>(channel: C, payload: EventPayload<C>): void {
    const spec = eventChannels[channel];
    const data = spec.payload.parse(payload);
    for (const [id, role] of this.roles) {
      if (!(spec.windows as readonly string[]).includes(role)) continue;
      const wc = webContentsById(id);
      if (wc && !wc.isDestroyed()) wc.send(channel, data);
    }
  }

  private authorize(event: IpcMainInvokeEvent, allowed: readonly string[], channel: string): WindowRole {
    const role = this.roles.get(event.sender.id);
    if (!role) throw new Error(`IPC ${channel}: unknown sender`);
    if (event.senderFrame !== event.sender.mainFrame) throw new Error(`IPC ${channel}: subframes are not allowed`);
    if (!allowed.includes(role)) throw new Error(`IPC ${channel}: not permitted for ${role} window`);
    return role;
  }
}

function webContentsById(id: number): WebContents | undefined {
  return webContents.fromId(id) ?? undefined;
}
