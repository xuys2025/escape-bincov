import { app, hideoutRuntime, saveSession } from './app';
import { encodeBackup, encodeRecoveryBackup } from './save-backup';
import { toast } from './toast';

/** Download the save as a backup file; shared by the tab page and the raid view. Failures only toast. */
export function exportSave() {
    try {
        let text: string;
        if (saveSession.requiresReload) text = encodeRecoveryBackup(saveSession.backupRecord()!);
        else if (app.state === 'hideout' && app.expansion && !app.pendingSettlement) {
            // At the base the HideoutRuntime's backup also carries a change whose write failed and waits for its retry
            // (a perk choice or reset): the same backup the yard exports.
            text = hideoutRuntime.exportBackup();
            if (!text) throw new Error('无法读取行动记录，请导出原始存档。');
        } else if (app.expansion || app.save.activeRun && !app.pendingSettlement) {
            // A raid in progress exports the Runtime's live capture (registered with the session), not the last checkpoint written.
            const record = saveSession.backupRecord();
            if (!record) throw new Error('无法读取行动记录，请导出原始存档。');
            text = encodeRecoveryBackup(record);
        } else if (app.pendingSettlement) text = encodeBackup(app.pendingSettlement);
        else text = encodeBackup(app.save);
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `Escape-Bincov-save-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('已生成备份文件，请确认下载完成。');
    } catch (error) { toast(error instanceof Error ? error.message : '备份下载失败，请重试。'); }
}
