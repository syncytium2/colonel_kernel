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