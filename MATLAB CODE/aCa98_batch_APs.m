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
