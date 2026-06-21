# Reference: MATLAB deconvolution pipeline (Tab 2 source-of-truth)

> **What this is.** This is the existing, validated lab method that **Tab 2** is being ported
> from. It is the proven procedure for recovering a calcium-indicator kernel from known spike
> times and measured traces. The web tool reimplements its *core* in JavaScript; this file is the
> **canonical record of what that core does**, so the JS port can be checked against it.
>
> This is **reference material, not a decision.** The ADRs that govern Tab 2 point *here* for the
> ground truth of the algorithm; they do not restate it. The source `.m` files live in
> `MATLAB CODE/` (`TDdeconvStack.m`, `aCa98_batch_APs.m`) and are pasted verbatim below.

---

## 1. The boundary — where the tool's responsibility starts and stops

This is the most important section. The MATLAB code does a great deal of lab-specific data
wrangling *before* it reaches the math the tool cares about. The tool deliberately does **not**
reimplement that upstream wrangling.

### The tool's scope STARTS at a single region's inputs

The web tool's responsibility begins exactly at the four inputs handed to `TDdeconvStack`:

| Input | MATLAB name | What it is |
|-------|-------------|------------|
| ROI traces | `bstack` | the dF/F₀ calcium traces for one region (in MATLAB an `m×n×k` image stack; in the tool, ROI columns) |
| Frame time vector | `btiming` | the frame timebase, one entry per frame |
| Spike event times | `spikes` | action-potential event *times* (not pre-binned) |
| Kernel half-window | `win` | kernel half-duration in seconds (`win = 5` in the driver) |

### Everything UPSTREAM stays in MATLAB (the CSV-export step)

The following all remain in MATLAB and are the user's job to run *before* exporting a CSV. The
tool never sees them:

- File loading and the lab data structures: `S_event`, `exp.start_end`,
  `ROIdata.dFoF0.ROI`.
- Region / experiment segmentation (splitting a recording into experimental regions).
- Solution-delay timing (`solution_delay`).
- The eligibility gates: `min_dur` (region duration), `min_ROIs` (active ROIs),
  `min_events` (event count).
- The `APs_v1_` output-file naming convention.

### Consequence

**The CSV the tool ingests is ONE region's worth of `traces + time + spike-times`.** The
segmentation, gating, and lab-format decoding have already happened upstream. A future MATLAB
`writetable`/`csvwrite` snippet (see `FOUNDATIONS.md` §5) is what bridges `bstack/btiming/spikes`
into that CSV.

---

## 2. The MATLAB source (verbatim)

### 2.1 `TDdeconvStack` — the inner per-pixel deconvolution function

```matlab
% deconvolve all pixels
function [kernels,kernel_time] = TDdeconvStack(stack, timing, spikes, window)
% troubleshoot
troubleshoot=0;
if troubleshoot==1
    figure
    plot(timing,squeeze(stack(1,:,:)))
end
% stack is m x n x k, where m x n is the image/frame size, k is the time index
    % for deconv
% timing is t x 1, containing the times of each frame (same units as
% events)
% spikes is k x 1, containing times of each events = action potential (same
% units as timing)
% window is the duration of the kernel (+/- window is full duration
% returned)

% output kernels is m x n x tk, where tk is the timing of the kernel
% kernel_time is tk x 1, with timing of the kernel (same units as above)
% each element of kernels is a kernel for that pixel

% if k is even, lose the last data point so we always have a center point
% of the kernel
[m,n,k]=size(stack);

if mod(k,2)
    stack(:,:,k)=[];
    timing(k)=[];
end
[m,n,k]=size(stack);
if mod(k,2)
    disp('loser!')
end

% convert spike times to spike density (continuous)
spike_density = hist( spikes( spikes < ( max(timing) ) ), timing );
% check that arrays are the same shape
if size(spike_density,2)~=k
    spike_density=spike_density';
end

% setup timing for kernel
center = round(k/2);
delta_t=mean( diff( timing ) );
window_samples = round( 1 / delta_t*window );
if k > 2* window_samples
    kernel_samples = window_samples*2+1;
    kernel_time = linspace( -window, window, kernel_samples );
    
    % setup parfor loop
    % linearize stack by pixels
    pixels = m * n;
    parstor = zeros( pixels, k, 'single' );
    for p=1:pixels
        [h,w]=ind2sub( [m,n], p );
        parstor(p,:) = stack( h, w, : );
    end
    ks = nan( pixels, kernel_samples );
    parfor p = 1 : pixels
    %for p = 1 : pixels
        % deconvolve
        pixel = parstor(p,:);
        d = deconvreg( pixel, spike_density );
        ks(p,:) = d( center-window_samples : center+window_samples );
    end
    % store kernel
    kernels = nan( m, n, kernel_samples );
    for p=1:pixels
        [h,w]=ind2sub( [m,n], p );
        kernels( h, w, : ) = ks( p, : );
    end
    if m==1
        kernels = squeeze(kernels);
    end
    if troubleshoot==1
    figure
    plot(kernel_time,squeeze(kernels(1,:,:)))
    end
else
    disp('region is too short for deconvolution: k<2*window_samples')
    kernels=[];
    kernel_time=[];
end
% plot gazillion kernels in an informative way
```

### 2.2 The calling pipeline (batch driver) — `aCa98_batch_APs.m`

```matlab
set(0,'DefaultFigureWindowStyle','docked');
% must run detection in batch mode (not event confirmation app)
% creates the array of region data tables from S_event

single_file=false;
if single_file
    [source_fn,path]=uigetfile("Z:\defazio turbo\data\processed\individual", "select individual file for Spiky");
    if source_fn
        % fake a directory selection
        files(1).folder = path;
        files(1).name=source_fn;
        nFiles=1;
    else
        disp('failed to load')
        return
    end
else
    path = "Z:\defazio turbo\data\processed\individual";
    %path=uigetdir("Z:\defazio turbo\data\processed\individual", "select folder containing individual files for spiky");
    %path="C:\Users\defazio\Documents\data\processed\individual";
    files = dir(fullfile(path,'*.mat'));
    nFiles = length(files);
end
APs_folder = "Z:\defazio turbo\data\APs";
APs_filename_prefix = "APs_v1_";
amp_threshold = 0;
width_threshold = 0.4; % seconds
min_dur = 5; % minutes

solution_delay = 2; % delay in minutes
min_ROIs = 2; % minimum number of active ROIs to run spiky
min_events = 10; % minimum number of events to run spiky
buffer = 10; % samples, yields 1 second, time before first spike and after last spike
expression = '\d{8}[a-z]?_?\d*';

% making stack from ROIdata
source_data = 'ROIdata'; % should make this selectable for superpixel stacks
stack_field = 'dFoF0';
stack_subfield = 'ROI';

% kernel params
win = 5; % seconds
% spike triggered averaging params, STA
STAwin = 2; % seconds, profound ramifications on the number of APs if frequency is high
STAbasewin = 0.5; % seconds, window before AP (t=0) for zeroing baseline in STA

nRuns = 4; % hard coded!
nRegions_max = 4;
for iFile=1:nFiles
    [fpath,fname,fext]=fileparts(files(iFile).name);
    APs_fname = append(APs_folder, "\",APs_filename_prefix,fname,".mat");
    if ~exist(APs_fname, 'file')
        % File doesn't exist.  Do stuff....
        if exist('name','var') && strcmp(name,fname)
            disp('already loaded')
        else
            load(fullfile(files(iFile).folder,files(iFile).name))
        end

        % convert s_event to "spikes", preserve APs!
        % spiky wants "spikes", a cell array of event timing
        if exist('spikes','var') && ~isempty(spikes)
            experiment = exp;
            maxExp = length( experiment );
            short_flag=false;
            % check for short or empty experiments
            iRegion=0;
            for ii=1:maxExp
                if ~isempty(experiment(ii).start_end)
                    iRegion=iRegion+1;
                    if iRegion==1
                        exp_delay=0;
                    else
                        exp_delay=solution_delay;
                    end
                    if isinf(experiment(ii).start_end(2))
                        exp_end = max(timing)/60;
                    else
                        exp_end = experiment(ii).start_end(2);
                    end
                    t_start = experiment(ii).start_end(1) + exp_delay;
                    t_end = exp_end; % experiment(ii).start_end(2);
                    dur = ( exp_end - ( t_start ) ); % minutes!
                    region(iRegion).t_start = t_start;
                    region(iRegion).t_end = t_end;
                    region(iRegion).exp_index = ii;
                    region(iRegion).name = strtrim( experiment(ii).name );
                    region(iRegion).dur = ( exp_end - ( experiment(ii).start_end(1) + exp_delay ) ); % minutes!
                end
            end
            % store the spikes for each reigon
            maxRegion = iRegion; %length(region);
            % spike_store = cell(maxRegion,1);

            nROIs=length(ROIdata);
            stack=zeros(1,nROIs,length(ROIdata(1).dFoF0.ROI));
            for iROI=1:nROIs
                stack(1,iROI,:)=ROIdata(iROI).(stack_field).(stack_subfield);
            end
            fluo_time = timing;
            dt = mean( diff( fluo_time ) );
            AP_times_Full = spikes;
            nAPs_total = max(size(~isnan(AP_times_Full)));
            k_sta_store = cell(maxRegion,2);
            for iRegion=1:maxRegion
                k_sta = [];
                if region(iRegion).dur > min_dur % region dur in seconds
                    %% gather the events

                    t_start = region(iRegion).t_start * 60;
                    t_end = region(iRegion).t_end * 60; % exp delay is already baked in

                    AP_times = AP_times_Full( and( AP_times_Full>t_start, AP_times_Full<t_end ));

                    nAPs = size(AP_times,1);
                    if nAPs > 1
                        disp(append(fname, ' ',region(iRegion).name,' ',num2str(nAPs), ' of ',num2str(nAPs_total)))

                        first_spike = min(AP_times,[],"all");
                        last_spike = max(AP_times,[],"all");

                        first_sample = find( fluo_time < first_spike, 1, "last" ) - buffer; % buffer is in samples

                        if isempty(first_sample)||first_sample<1
                            first_sample=1;
                        end

                        last_sample = find( fluo_time > last_spike, 1, "first" ) + buffer;

                        [p,n,k] = size( stack );
                        if isempty(last_sample) || ( last_sample > k )
                            last_sample = k;
                        end

                        clear bstack
                        clear btiming
                        bstack = stack(:,:, first_sample : last_sample );
                        btiming = fluo_time( first_sample : last_sample );

                        indices =  find(( AP_times>fluo_time(1) ) .* ( AP_times<fluo_time(end) ) );
                        spikes = AP_times( indices, 1 );

                        k_sta.stack = bstack;
                        k_sta.timing = btiming;
                        k_sta.spikes = spikes;
                        k_sta.name = region(iRegion).name;
                        k_sta.nAPs = nAPs;

                        tic
                        [kernels,kernel_time] = TDdeconvStack( ...
                            bstack, btiming, spikes, win );

                        disp(append(region(iRegion).name,' ', fname,' : TDdeconvStack cost: ',num2str(toc)))

                        if ~isempty(kernels)
                            k_sta.kernels.kernels = kernels;
                            k_sta.kernels.kernel_time = kernel_time;
                        else
                            k_sta.kernels=[];
                        end

                        % now do STA
                        tic
                        [p,n,k]=size(bstack);
                        clear STA
                        clear allEvents
                        clear STA_time

                        for im=1:p
                            for in=1:n
                                % STA for each pixel
                                pixel = squeeze( bstack(im,in,:) ); % squeeze(S(iFile).(stackn)(im,in,:));
                                [ STAX, allEventsX, STA_timeX ] = spikeTriggeredAverage( spikes, pixel, btiming, 0, inf, STAwin, STAbasewin );
                                if ~isempty(STAX)
                                    STA(im,in,:)=STAX;
                                    allEvents(im,in,:,:)=allEventsX;
                                    STA_time = STA_timeX;
                                else
                                    STA=[];
                                    allEvents=[];
                                    STA_time = [];
                                end
                            end
                        end
                        % store the STA

                        if ~isempty(STA)
                            k_sta.STA.STA=STA;
                            k_sta.STA.Events=allEvents;
                            k_sta.STA.STA_time=STA_time;
                        else
                            k_sta.STA=[];
                        end
                        disp(append(region(iRegion).name,' ', fname,' : STA cost: ',num2str(toc)))
                    else
                        disp(append('SKIPPING: ', fname, ' ',region(iRegion).name,' ',num2str(nAPs), ' of ',num2str(nAPs_total)))
                    end

                else
                    disp(append('skipped, short region: ',region(iRegion).name,' dur: ',num2str(region(iRegion).dur)))
                end % region dur is long enough
                k_sta_store{iRegion,1} = region(iRegion).name;
                k_sta_store{iRegion,2} = k_sta;
            end % loop over the regions
            save(APs_fname,"k_sta_store")
            disp(append("saved kernels and STA: ",APs_fname))
        else
            disp(append("file lacks APs: ", fname))
        end
    else 
        % File already exists, skip this iFile!
        warningMessage = sprintf('Warning: file already exists, analysis not updated:\n%s', APs_fname );
        disp(warningMessage)
    end
end % loop over files
```

---

## 3. Annotations — key facts established (so a future reader needn't re-derive them)

These are the non-obvious facts about *why* the code does what it does. They are the bridge from
this MATLAB to the JS port.

### 3.1 The commutativity trick — what actually comes back is the kernel

`deconvreg(pixel, spike_density)` passes the calcium **trace** (`pixel`) as the "image" and the
**spikes** (`spike_density`) as the "PSF". Because `output = spikes ⊗ kernel`, what `deconvreg`
returns as the deconvolved "input" is **the kernel**. This is the crux of the whole method: it
exploits convolution's commutativity to recover the kernel rather than the (already-known) spikes.

### 3.2 Regularization is silent — the tool makes it explicit

`deconvreg` is MATLAB's constrained-least-squares deconvolution with a **default Laplacian
smoothness prior**, applied here to the recovered kernel. It is called **with no explicit
regularization parameter**, so the smoothing happens **silently** at whatever the default is.

> **Tool consequence:** the JS port will make this regularization **explicit and adjustable** (a
> visible parameter / slider), per `FOUNDATIONS.md` §7 (Wiener / Tikhonov regularization with the
> parameter exposed). What was hidden in the lab method becomes a first-class, inspectable control.

### 3.3 Spike representation — raw times in, binning happens inside

Spikes enter as event **times**. `TDdeconvStack` histograms them onto the frame grid internally:
`spike_density = hist(spikes(...), timing)`. So **binned-count happens *inside* the deconvolution
step** (see [ADR-0001](../adr/0001-delta-rasterization.md) — binned-count amplitude mode).

> **Tool consequence:** the **CSV carries raw spike times, not pre-binned counts.** The
> rasterization to a per-frame count is the tool's job, matching the MATLAB `hist(...)` step.

### 3.4 Window logic — odd length, symmetric ± lag, short-region guard

- Forces an **odd** kernel length so there is a true **center** sample.
- `delta_t = mean(diff(timing))`; `window_samples = round(window / delta_t)`.
- `kernel_samples = window_samples*2 + 1`; extracts symmetrically as
  `center - window_samples : center + window_samples`, yielding a kernel spanning **negative *and*
  positive lag** (`kernel_time = linspace(-window, window, kernel_samples)`).
- **Guard:** requires `k > 2*window_samples`, otherwise it bails with *"region is too short for
  deconvolution"* and returns empty.

### 3.5 The `buffer` — padding so kernel edges aren't data-starved

The driver crops each region with `buffer = 10` samples of padding **before the first spike and
after the last spike** (`first_sample = ... - buffer`, `last_sample = ... + buffer`). This keeps
the kernel's edges from being starved of data near the boundaries.

### 3.6 Per-pixel loop → per-ROI-column loop

`TDdeconvStack` loops over every pixel of an `m×n×k` image stack (`parfor p = 1:pixels`). In the
CSV tool this maps to a **per-ROI-column loop**: the *same* operation, just reorganized from
image pixels to ROI columns. This is exactly the per-column kernel recovery in
`FOUNDATIONS.md` §4 (the multi-ROI phenomenon).

### 3.7 The gap the tool must add — scoring the kernels

`TDdeconvStack` **recovers** kernels but does **not score** them. Its closing comment —
*"plot a gazillion kernels in an informative way"* — names the unsolved problem. **That is exactly
what the tool solves** via the goodness-of-fit readout (`FOUNDATIONS.md` §3): kernel plausibility,
reconstruction residual, and stability. Recovery is the inherited part; *judgment* is the new
part.

### 3.8 STA runs alongside deconvolution — always computed together

The calling pipeline **also** runs **spike-triggered averaging (STA)** on the same data, right
beside the deconvolution, via `spikeTriggeredAverage(...)`. Params: `STAwin = 2 s`,
`STAbasewin = 0.5 s` (the baseline-zeroing window before each AP, `t = 0`). The two results are
always computed together and stored together as `k_sta`. STA is the model-free companion to the
deconvolved kernel — useful context for whether a recovered kernel is believable.
