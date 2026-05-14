import { EmptyRequest } from "@shared/proto/cline/common"
import type { Worktree } from "@shared/proto/cline/worktree"
import { TrackWorktreeViewOpenedRequest } from "@shared/proto/cline/worktree"
import { GitBranch } from "lucide-react"
import React, { useCallback, useEffect, useState } from "react"
import HistoryPreview from "@/components/history/HistoryPreview"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import HomeHeader from "@/components/welcome/HomeHeader"
import { SuggestedTasks } from "@/components/welcome/SuggestedTasks"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { WorktreeServiceClient } from "@/services/grpc-client"
import { WelcomeSectionProps } from "../../types/chatTypes"

/**
 * Welcome section shown when there's no active task (Periscope: no Cline banners, Kanban, or announcement queue).
 */
export const WelcomeSection: React.FC<WelcomeSectionProps> = ({ showHistoryView, taskHistory, shouldShowQuickWins }) => {
	const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null)
	const [currentWorktree, setCurrentWorktree] = useState<Worktree | null>(null)

	useEffect(() => {
		WorktreeServiceClient.listWorktrees(EmptyRequest.create({}))
			.then((result) => {
				const canUseWorktrees = result.isGitRepo && !result.isMultiRoot && !result.isSubfolder
				setIsGitRepo(canUseWorktrees)
				if (canUseWorktrees) {
					const current = result.worktrees.find((w) => w.isCurrent)
					setCurrentWorktree(current || null)
				}
			})
			.catch(() => setIsGitRepo(false))
	}, [])

	const { navigateToWorktrees, worktreesEnabled } = useExtensionState()

	const handleWorktreeClick = useCallback(() => {
		WorktreeServiceClient.trackWorktreeViewOpened(TrackWorktreeViewOpenedRequest.create({ source: "home_page" })).catch(
			console.error,
		)
		navigateToWorktrees()
	}, [navigateToWorktrees])

	return (
		<div className="flex flex-col flex-1 w-full h-full p-0 m-0">
			<div className="overflow-y-auto flex flex-col pb-2.5">
				<HomeHeader shouldShowQuickWins={shouldShowQuickWins} />
				{!shouldShowQuickWins && taskHistory.length > 0 && <HistoryPreview showHistoryView={showHistoryView} />}
				{isGitRepo && worktreesEnabled?.featureFlag && worktreesEnabled?.user && (
					<div className="flex flex-col items-center gap-3 mt-2 mb-4 px-5">
						{currentWorktree && (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										className="flex flex-col items-center gap-0.5 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer bg-transparent border-none p-1 rounded"
										onClick={handleWorktreeClick}
										type="button">
										<div className="flex items-center gap-1.5 text-xs">
											<GitBranch className="w-3 h-3 stroke-[2.5] flex-shrink-0" />
											<span className="break-all text-center">
												<span className="font-semibold">Current:</span>{" "}
												{currentWorktree.branch || "detached HEAD"}
											</span>
										</div>
										<span className="break-all text-center max-w-[300px]">{currentWorktree.path}</span>
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">View and manage git worktrees.</TooltipContent>
							</Tooltip>
						)}
					</div>
				)}
			</div>
			<SuggestedTasks shouldShowQuickWins={shouldShowQuickWins} />
		</div>
	)
}
