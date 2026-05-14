interface HomeHeaderProps {
	/** @deprecated Periscope — quick wins / tour removed; kept for WelcomeSection compatibility */
	shouldShowQuickWins?: boolean
}

/**
 * Neutral Periscope home header (no Cline mascot assets or hosted onboarding tour).
 */
const HomeHeader = (_props: HomeHeaderProps) => {
	return (
		<div className="flex flex-col items-center mb-5">
			<div aria-hidden className="my-7 flex items-center justify-center text-[var(--vscode-foreground)] opacity-90">
				<span className="codicon codicon-telescope" style={{ fontSize: "4rem" }} />
			</div>
			<div className="text-center flex items-center justify-center px-4">
				<h1 className="m-0 font-bold">What should we tackle?</h1>
			</div>
		</div>
	)
}

export default HomeHeader
